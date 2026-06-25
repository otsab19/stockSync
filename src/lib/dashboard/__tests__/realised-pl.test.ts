import { describe, expect, it } from "vitest"
import { resolveTotalRealisedPlGbp } from "@/lib/dashboard/realised-pl"
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
    grossAmountGbp: 100,
    ...overrides,
  }
}

describe("realised p/l resolution", () => {
  it("prefers broker account snapshots for all-time totals", () => {
    const activity = [
      makeEvent({ id: "sell-1", type: "sell", realisedProfitGbp: 10 }),
      makeEvent({
        id: "etoro:1:close:2026-06-02T09:00:00Z:110",
        type: "sell",
        broker: "etoro",
        brokerLabel: "eToro",
        orderType: "Close",
        realisedProfitGbp: 20,
      }),
    ]

    const total = resolveTotalRealisedPlGbp(activity, {
      preferAccountSnapshots: true,
      brokerAccounts: [{
        broker: "t212",
        currency: "GBP",
        availableCash: 100,
        investedAmount: 1000,
        totalEquity: 1100,
        holdingsValue: 1000,
        unrealizedPl: -50,
        realizedPl: 455.44,
      }],
    })

    expect(total).toBeCloseTo(475.44, 2)
  })

  it("ignores fifo-only sells without broker-reported p/l", () => {
    const activity = [
      makeEvent({ id: "buy-1", type: "buy", grossAmountGbp: 100 }),
      makeEvent({ id: "sell-1", type: "sell", grossAmountGbp: 150 }),
    ]

    expect(resolveTotalRealisedPlGbp(activity)).toBe(0)
  })

  it("does not sum partial t212 fill p/l when all-time snapshot is missing", () => {
    const activity = [
      makeEvent({ id: "sell-1", type: "sell", realisedProfitGbp: -50 }),
      makeEvent({
        id: "etoro:1:close:2026-06-02T09:00:00Z:110",
        type: "sell",
        broker: "etoro",
        brokerLabel: "eToro",
        orderType: "Close",
        realisedProfitGbp: 20,
      }),
    ]

    expect(resolveTotalRealisedPlGbp(activity, { preferAccountSnapshots: true })).toBe(20)
  })
})
