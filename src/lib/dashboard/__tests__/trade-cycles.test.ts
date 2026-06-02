import { describe, expect, it } from "vitest"
import { buildTradeCycles, groupTradeCyclesByStock } from "@/lib/dashboard/trade-cycles"
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
    expect(groups[0].cycles).toHaveLength(2)
    expect(groups[0].netPlGbp).toBe(5)
  })
})
