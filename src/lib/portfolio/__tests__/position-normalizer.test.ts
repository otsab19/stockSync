import { describe, expect, it } from "vitest"
import { aggregatePositionsForStorage, normalizePortfolioPosition } from "@/lib/portfolio/position-normalizer"
import type { PortfolioPosition } from "@/types/portfolio"

function createPosition(overrides: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    id: "etoro-nvda",
    externalPositionId: "ticker:NVDA",
    ticker: "NVDA",
    companyName: "NVIDIA Corporation",
    broker: "etoro",
    brokerLabel: "eToro",
    assetType: "stock",
    shares: 2,
    nativeCurrency: "USD",
    avgPrice: 100,
    livePrice: 110,
    fxRateToGbp: 0.79,
    nativeTotalValue: 220,
    normalizedTotalValueGbp: 173.8,
    totalPL: 15.8,
    totalPLPercent: 10,
    alertDelta: 9.2,
    alertStatus: "stable",
    recentChange: 1.2,
    ...overrides,
  }
}

describe("normalizePortfolioPosition", () => {
  it("backfills externalPositionId and id for legacy cached rows", () => {
    const legacy = {
      ...createPosition(),
      id: "etoro-nvda",
      externalPositionId: undefined as unknown as string,
    }

    const normalized = normalizePortfolioPosition(legacy)

    expect(normalized.externalPositionId).toBe("ticker:NVDA")
    expect(normalized.id).toBe("etoro-nvda")
  })
})

describe("aggregatePositionsForStorage", () => {
  it("merges duplicate broker/ticker rows into one stored position", () => {
    const merged = aggregatePositionsForStorage([
      createPosition({ shares: 2, avgPrice: 100, nativeTotalValue: 220, totalPL: 20, normalizedTotalValueGbp: 173.8, externalPositionId: "position:1" }),
      createPosition({ shares: 3, avgPrice: 120, nativeTotalValue: 330, totalPL: 30, normalizedTotalValueGbp: 260.7, externalPositionId: "position:2" }),
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]?.shares).toBe(5)
    expect(merged[0]?.avgPrice).toBeCloseTo(112, 5)
    expect(merged[0]?.nativeTotalValue).toBeCloseTo(550, 5)
    expect(merged[0]?.totalPL).toBeCloseTo(50, 5)
  })

  it("keeps separate rows for different brokers or tickers", () => {
    const merged = aggregatePositionsForStorage([
      createPosition({ broker: "etoro", brokerLabel: "eToro", ticker: "NVDA" }),
      createPosition({ broker: "t212", brokerLabel: "Trading 212", ticker: "NVDA", id: "t212-nvda", externalPositionId: "ticker:NVDA" }),
      createPosition({ ticker: "AAPL", companyName: "Apple Inc.", id: "etoro-aapl", externalPositionId: "ticker:AAPL" }),
    ])

    expect(merged).toHaveLength(3)
  })
})
