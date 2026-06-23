import { describe, expect, it } from "vitest"
import { buildTradeCycles, groupTradeCycles, groupTradeCyclesByBroker, groupTradeCyclesBySide, groupTradeCyclesByStock } from "@/lib/dashboard/trade-cycles"
import type { PortfolioActivityEvent } from "@/types/portfolio"

function makeEvent(overrides: Partial<PortfolioActivityEvent> & Pick<PortfolioActivityEvent, "id" | "type">): PortfolioActivityEvent {
  return {
    timestamp: "2026-06-01T10:00:00Z",
    broker: "t212",
    brokerLabel: "Trading 212",
    ticker: "NVDA",
    companyName: "NVIDIA Corporation",
    shares: 1,
    price: 100,
    nativeCurrency: "USD",
    grossAmount: 100,
    grossAmountGbp: 79,
    ...overrides,
  }
}

describe("trade cycles", () => {
  it("pairs eToro open and close legs by position id", () => {
    const activity = [
      makeEvent({
        id: "etoro:123:open:2026-06-01T09:00:00Z:100",
        broker: "etoro",
        brokerLabel: "eToro",
        type: "buy",
        orderType: "Open",
        grossAmountGbp: 100,
      }),
      makeEvent({
        id: "etoro:123:close:2026-06-01T15:00:00Z:110",
        broker: "etoro",
        brokerLabel: "eToro",
        type: "sell",
        orderType: "Close",
        grossAmountGbp: 110,
        realisedProfitGbp: 10,
      }),
    ]

    const cycles = buildTradeCycles(activity)

    expect(cycles).toHaveLength(1)
    expect(cycles[0].plGbp).toBe(10)
    expect(cycles[0].buys[0]?.orderType).toBe("Open")
    expect(cycles[0].sell?.orderType).toBe("Close")
  })

  it("creates separate eToro round trips when only the instrument id is shared", () => {
    const activity = [
      makeEvent({
        id: "etoro:1137:open:2026-05-01T09:00:00Z:100",
        broker: "etoro",
        brokerLabel: "eToro",
        type: "buy",
        orderType: "Open",
        grossAmountGbp: 100,
      }),
      makeEvent({
        id: "etoro:1137:close:2026-05-01T15:00:00Z:110",
        broker: "etoro",
        brokerLabel: "eToro",
        type: "sell",
        orderType: "Close",
        grossAmountGbp: 110,
        realisedProfitGbp: 10,
      }),
      makeEvent({
        id: "etoro:1137:open:2026-06-01T09:00:00Z:120",
        broker: "etoro",
        brokerLabel: "eToro",
        type: "buy",
        orderType: "Open",
        grossAmountGbp: 120,
      }),
      makeEvent({
        id: "etoro:1137:close:2026-06-01T15:00:00Z:130",
        broker: "etoro",
        brokerLabel: "eToro",
        type: "sell",
        orderType: "Close",
        grossAmountGbp: 130,
        realisedProfitGbp: 10,
      }),
    ]

    const groups = groupTradeCyclesByBroker(buildTradeCycles(activity))

    expect(groups.find((group) => group.key === "etoro")?.netPlGbp).toBe(20)
  })

  it("matches trading 212 buys and sells with equal share counts", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", timestamp: "2026-06-01T09:00:00Z", shares: 10, grossAmountGbp: 50 }),
      makeEvent({ id: "t212:sell-1", type: "sell", timestamp: "2026-06-01T12:00:00Z", shares: 10, grossAmountGbp: 60 }),
    ]

    const cycles = buildTradeCycles(activity)

    expect(cycles).toHaveLength(1)
    expect(cycles[0].plGbp).toBe(10)
  })

  it("uses share-based fifo when a sell closes more shares than one buy lot", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", timestamp: "2026-01-01T09:00:00Z", shares: 100, grossAmountGbp: 1000 }),
      makeEvent({ id: "t212:buy-2", type: "buy", timestamp: "2026-01-02T09:00:00Z", shares: 200, grossAmountGbp: 1600 }),
      makeEvent({ id: "t212:sell-1", type: "sell", timestamp: "2026-01-03T09:00:00Z", shares: 250, grossAmountGbp: 1750 }),
    ]

    const cycles = buildTradeCycles(activity)
    const sellCycle = cycles.find((cycle) => cycle.sell?.id === "t212:sell-1")

    expect(sellCycle?.buys).toHaveLength(2)
    expect(sellCycle?.plGbp).toBeCloseTo(-450, 2)
  })

  it("prefers broker-reported realised profit on sells", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", timestamp: "2026-01-01T09:00:00Z", shares: 100, grossAmountGbp: 1000 }),
      makeEvent({
        id: "t212:sell-1",
        type: "sell",
        timestamp: "2026-01-03T09:00:00Z",
        shares: 250,
        grossAmountGbp: 1750,
        realisedProfitGbp: -123.45,
      }),
    ]

    const cycles = buildTradeCycles(activity)

    expect(cycles.find((cycle) => cycle.sell?.id === "t212:sell-1")?.plGbp).toBe(-123.45)
  })

  it("groups cycles by stock and sums p/l", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", shares: 10, grossAmountGbp: 50 }),
      makeEvent({ id: "t212:sell-1", type: "sell", shares: 10, grossAmountGbp: 60 }),
      makeEvent({ id: "t212:buy-2", type: "buy", shares: 10, grossAmountGbp: 20 }),
      makeEvent({ id: "t212:sell-2", type: "sell", shares: 10, grossAmountGbp: 15 }),
    ]

    const groups = groupTradeCyclesByStock(buildTradeCycles(activity))

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe("NVDA")
    expect(groups[0].cycles).toHaveLength(2)
    expect(groups[0].netPlGbp).toBe(5)
  })

  it("groups cycles by broker", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", broker: "t212", brokerLabel: "Trading 212", shares: 10, grossAmountGbp: 50 }),
      makeEvent({ id: "t212:sell-1", type: "sell", broker: "t212", brokerLabel: "Trading 212", shares: 10, grossAmountGbp: 60 }),
      makeEvent({ id: "etoro:456:open:2026-06-01T09:00:00Z:100", type: "buy", broker: "etoro", brokerLabel: "eToro", orderType: "Open", grossAmountGbp: 100 }),
      makeEvent({ id: "etoro:456:close:2026-06-01T15:00:00Z:110", type: "sell", broker: "etoro", brokerLabel: "eToro", orderType: "Close", grossAmountGbp: 110, realisedProfitGbp: 10 }),
    ]

    const groups = groupTradeCyclesByBroker(buildTradeCycles(activity))

    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.key === "t212")?.netPlGbp).toBe(10)
    expect(groups.find((group) => group.key === "etoro")?.netPlGbp).toBe(10)
  })

  it("groups cycles by buy/sell side", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", shares: 10, grossAmountGbp: 50 }),
      makeEvent({ id: "t212:sell-1", type: "sell", shares: 10, grossAmountGbp: 60 }),
    ]

    const groups = groupTradeCyclesBySide(buildTradeCycles(activity))

    expect(groups).toHaveLength(2)
    expect(groups[0].key).toBe("buys")
    expect(groups[0].cycles).toHaveLength(1)
    expect(groups[1].key).toBe("sells")
    expect(groups[1].netPlGbp).toBe(10)
  })

  it("returns a flat group when grouping is disabled", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", shares: 10, grossAmountGbp: 50 }),
      makeEvent({ id: "t212:sell-1", type: "sell", shares: 10, grossAmountGbp: 60 }),
    ]

    const groups = groupTradeCycles(buildTradeCycles(activity), "none")

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe("all")
    expect(groups[0].cycles).toHaveLength(1)
  })
})
