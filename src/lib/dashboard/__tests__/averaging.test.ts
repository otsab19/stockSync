import { describe, expect, it } from "vitest"
import { combineTickerLots, groupPositionsByTicker, projectNewAverage } from "@/lib/dashboard/averaging"
import type { PortfolioPosition } from "@/types/portfolio"

function makePosition(overrides: Partial<PortfolioPosition>): PortfolioPosition {
  return {
    id: "pos-1",
    externalPositionId: "ticker:NVDA",
    broker: "t212",
    brokerLabel: "Trading 212",
    ticker: "NVDA",
    companyName: "NVIDIA Corporation",
    assetType: "stock",
    shares: 2,
    avgPrice: 50,
    livePrice: 60,
    nativeCurrency: "USD",
    fxRateToGbp: 0.8,
    nativeTotalValue: 120,
    normalizedTotalValueGbp: 96,
    totalPL: 16,
    totalPLPercent: 20,
    alertDelta: 0,
    alertStatus: "stable",
    recentChange: 0,
    ...overrides,
  }
}

describe("groupPositionsByTicker", () => {
  it("groups lots from multiple brokers under one ticker", () => {
    const grouped = groupPositionsByTicker([
      makePosition({ id: "a", broker: "t212" }),
      makePosition({ id: "b", broker: "etoro", brokerLabel: "eToro" }),
      makePosition({ id: "c", ticker: "AAPL" }),
    ])

    expect(grouped.get("NVDA")).toHaveLength(2)
    expect(grouped.get("AAPL")).toHaveLength(1)
  })
})

describe("combineTickerLots", () => {
  it("computes a share-weighted average across brokers and lots", () => {
    const aggregate = combineTickerLots([
      makePosition({ id: "a", broker: "t212", shares: 2, avgPrice: 50 }),
      makePosition({ id: "b", broker: "etoro", brokerLabel: "eToro", shares: 6, avgPrice: 100 }),
    ])

    expect(aggregate).not.toBeNull()
    expect(aggregate!.totalShares).toBe(8)
    // (2*50 + 6*100) / 8 = 87.5
    expect(aggregate!.avgPrice).toBeCloseTo(87.5)
    expect(aggregate!.currency).toBe("USD")
    expect(aggregate!.isFxNormalized).toBe(false)
    expect(aggregate!.brokerCount).toBe(2)
  })

  it("merges multiple lots from the same broker into one breakdown row", () => {
    const aggregate = combineTickerLots([
      makePosition({ id: "a", broker: "etoro", brokerLabel: "eToro", shares: 1, avgPrice: 100 }),
      makePosition({ id: "b", broker: "etoro", brokerLabel: "eToro", shares: 3, avgPrice: 200 }),
    ])

    expect(aggregate!.brokers).toHaveLength(1)
    // (1*100 + 3*200) / 4 = 175
    expect(aggregate!.brokers[0].avgPrice).toBeCloseTo(175)
    expect(aggregate!.brokers[0].shares).toBe(4)
  })

  it("normalizes to GBP when lots use mixed currencies", () => {
    const aggregate = combineTickerLots([
      makePosition({ id: "a", shares: 1, avgPrice: 100, livePrice: 120, nativeCurrency: "USD", fxRateToGbp: 0.8 }),
      makePosition({ id: "b", broker: "etoro", brokerLabel: "eToro", shares: 1, avgPrice: 90, livePrice: 100, nativeCurrency: "GBP", fxRateToGbp: 1 }),
    ])

    expect(aggregate!.currency).toBe("GBP")
    expect(aggregate!.isFxNormalized).toBe(true)
    // (1*100*0.8 + 1*90*1) / 2 = 85
    expect(aggregate!.avgPrice).toBeCloseTo(85)
    // (1*120*0.8 + 1*100*1) / 2 = 98
    expect(aggregate!.livePrice).toBeCloseTo(98)
  })

  it("returns null for empty input or zero shares", () => {
    expect(combineTickerLots([])).toBeNull()
    expect(combineTickerLots([makePosition({ shares: 0 })])).toBeNull()
  })
})

describe("projectNewAverage", () => {
  it("moves the average toward the buy price proportionally to the amount", () => {
    const projection = projectNewAverage({ totalShares: 10, avgPrice: 50, buyAmount: 1000, buyPrice: 100 })

    expect(projection).not.toBeNull()
    expect(projection!.newShares).toBeCloseTo(10)
    expect(projection!.newTotalShares).toBeCloseTo(20)
    // (10*50 + 10*100) / 20 = 75
    expect(projection!.newAvg).toBeCloseTo(75)
    expect(projection!.avgChange).toBeCloseTo(25)
    expect(projection!.avgChangePercent).toBeCloseTo(50)
  })

  it("lowers the average when buying below the current average", () => {
    const projection = projectNewAverage({ totalShares: 4, avgPrice: 200, buyAmount: 400, buyPrice: 100 })

    // (4*200 + 4*100) / 8 = 150
    expect(projection!.newAvg).toBeCloseTo(150)
    expect(projection!.avgChange).toBeLessThan(0)
  })

  it("keeps the average unchanged for a zero amount", () => {
    const projection = projectNewAverage({ totalShares: 4, avgPrice: 200, buyAmount: 0, buyPrice: 100 })

    expect(projection!.newAvg).toBeCloseTo(200)
    expect(projection!.newShares).toBe(0)
  })

  it("returns null for invalid inputs", () => {
    expect(projectNewAverage({ totalShares: 0, avgPrice: 50, buyAmount: 100, buyPrice: 100 })).toBeNull()
    expect(projectNewAverage({ totalShares: 10, avgPrice: 50, buyAmount: 100, buyPrice: 0 })).toBeNull()
    expect(projectNewAverage({ totalShares: 10, avgPrice: 50, buyAmount: -5, buyPrice: 100 })).toBeNull()
  })
})
