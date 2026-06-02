import { describe, expect, it } from "vitest"
import { buildTradeCycles, computeTradeCyclePl, groupTradeCyclesByStock } from "@/lib/dashboard/trade-cycles"
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
    expect(cycles[0].buy?.orderType).toBe("Open")
    expect(cycles[0].sell?.orderType).toBe("Close")
  })

  it("matches trading 212 buys and sells in fifo order", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", timestamp: "2026-06-01T09:00:00Z", grossAmountGbp: 50 }),
      makeEvent({ id: "t212:sell-1", type: "sell", timestamp: "2026-06-01T12:00:00Z", grossAmountGbp: 60 }),
    ]

    const cycles = buildTradeCycles(activity)

    expect(cycles).toHaveLength(1)
    expect(computeTradeCyclePl(cycles[0].buy, cycles[0].sell)).toBe(10)
  })

  it("groups cycles by stock and sums p/l", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", grossAmountGbp: 50 }),
      makeEvent({ id: "t212:sell-1", type: "sell", grossAmountGbp: 60 }),
      makeEvent({ id: "t212:buy-2", type: "buy", grossAmountGbp: 20 }),
      makeEvent({ id: "t212:sell-2", type: "sell", grossAmountGbp: 15 }),
    ]

    const groups = groupTradeCyclesByStock(buildTradeCycles(activity))

    expect(groups).toHaveLength(1)
    expect(groups[0].cycles).toHaveLength(2)
    expect(groups[0].netPlGbp).toBe(5)
  })
})
