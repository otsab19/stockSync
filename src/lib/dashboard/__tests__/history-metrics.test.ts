import { describe, expect, it } from "vitest"
import {
  buildCumulativeRealisedPlSeries,
  buildHistoryPerformanceMetrics,
  buildHistoryTradeMetrics,
  buildTickerTradeSummaries,
} from "@/lib/dashboard/history-metrics"
import type { PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"

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
    nativeTotalValue: 120,
    normalizedTotalValueGbp: 95,
    fxRateToGbp: 0.79,
    totalPL: 15,
    totalPLPercent: 15,
    alertDelta: 0,
    alertStatus: "stable",
    recentChange: 1,
    ...overrides,
  }
}

describe("history metrics", () => {
  it("aggregates open position metrics across brokers", () => {
    const portfolio = [
      makePosition({ broker: "t212", normalizedTotalValueGbp: 100, totalPL: 10, shares: 1, avgPrice: 90, fxRateToGbp: 1 }),
      makePosition({ broker: "etoro", brokerLabel: "eToro", normalizedTotalValueGbp: 50, totalPL: 5, shares: 1, avgPrice: 45, fxRateToGbp: 1 }),
    ]

    const metrics = buildHistoryPerformanceMetrics(portfolio, [])

    expect(metrics.open.valueGbp).toBe(150)
    expect(metrics.open.costBasisGbp).toBe(135)
    expect(metrics.open.unrealisedPlGbp).toBe(15)
    expect(metrics.brokers).toHaveLength(2)
  })

  it("keeps realised p/l aligned with per-broker round trips", () => {
    const portfolio = [
      makePosition({ broker: "t212", normalizedTotalValueGbp: 100, totalPL: 10, shares: 1, avgPrice: 90, fxRateToGbp: 1 }),
      makePosition({ broker: "etoro", brokerLabel: "eToro", normalizedTotalValueGbp: 50, totalPL: 5, shares: 1, avgPrice: 45, fxRateToGbp: 1 }),
    ]
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", grossAmountGbp: 100, timestamp: "2026-06-01T09:00:00Z" }),
      makeEvent({ id: "t212:sell-1", type: "sell", grossAmountGbp: 130, realisedProfitGbp: 30, timestamp: "2026-06-02T09:00:00Z" }),
      makeEvent({ id: "etoro:1137:open:2026-06-01T09:00:00Z:100", type: "buy", broker: "etoro", brokerLabel: "eToro", orderType: "Open", grossAmountGbp: 100, timestamp: "2026-06-01T09:00:00Z" }),
      makeEvent({ id: "etoro:1137:close:2026-06-02T09:00:00Z:110", type: "sell", broker: "etoro", brokerLabel: "eToro", orderType: "Close", grossAmountGbp: 120, realisedProfitGbp: 20, timestamp: "2026-06-02T09:00:00Z" }),
    ]

    const metrics = buildHistoryPerformanceMetrics(portfolio, activity)
    const brokerRealisedTotal = metrics.brokers.reduce((sum, broker) => sum + broker.realisedPlGbp, 0)

    expect(metrics.history.realisedPlGbp).toBe(50)
    expect(brokerRealisedTotal).toBe(50)
  })

  it("computes realised p/l and win rate from broker-reported sell p/l", () => {
    const activity = [
      makeEvent({ id: "buy-1", type: "buy", grossAmountGbp: 100, timestamp: "2026-06-01T09:00:00Z" }),
      makeEvent({ id: "sell-1", type: "sell", grossAmountGbp: 130, realisedProfitGbp: 30, timestamp: "2026-06-02T09:00:00Z" }),
      makeEvent({ id: "buy-2", type: "buy", grossAmountGbp: 80, timestamp: "2026-06-03T09:00:00Z" }),
      makeEvent({ id: "sell-2", type: "sell", grossAmountGbp: 70, realisedProfitGbp: -10, timestamp: "2026-06-04T09:00:00Z" }),
    ]

    const history = buildHistoryTradeMetrics(activity)

    expect(history.realisedPlGbp).toBe(20)
    expect(history.closedTradeCount).toBe(2)
    expect(history.winRate).toBe(50)
    expect(history.totalBoughtGbp).toBe(180)
    expect(history.totalSoldGbp).toBe(200)
  })

  it("uses broker account snapshots for all-time realised p/l when available", () => {
    const activity = [
      makeEvent({ id: "t212:sell-1", type: "sell", grossAmountGbp: 130, realisedProfitGbp: 30, timestamp: "2026-06-02T09:00:00Z" }),
      makeEvent({ id: "etoro:1137:close:2026-06-02T09:00:00Z:110", type: "sell", broker: "etoro", brokerLabel: "eToro", orderType: "Close", grossAmountGbp: 120, realisedProfitGbp: 20, timestamp: "2026-06-02T09:00:00Z" }),
    ]

    const history = buildHistoryTradeMetrics(activity, {
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

    expect(history.realisedPlGbp).toBeCloseTo(475.44, 2)
  })

  it("builds cumulative realised p/l series by sell date", () => {
    const activity = [
      makeEvent({ id: "buy-1", type: "buy", grossAmountGbp: 100, timestamp: "2026-06-01T09:00:00Z" }),
      makeEvent({ id: "sell-1", type: "sell", grossAmountGbp: 120, realisedProfitGbp: 20, timestamp: "2026-06-01T15:00:00Z" }),
      makeEvent({ id: "buy-2", type: "buy", grossAmountGbp: 50, timestamp: "2026-06-02T09:00:00Z" }),
      makeEvent({ id: "sell-2", type: "sell", grossAmountGbp: 40, realisedProfitGbp: -10, timestamp: "2026-06-03T09:00:00Z" }),
    ]

    const series = buildCumulativeRealisedPlSeries(activity)

    expect(series).toHaveLength(2)
    expect(series[0]?.realisedPlGbp).toBe(20)
    expect(series[1]?.realisedPlGbp).toBe(-10)
    expect(series[1]?.cumulativeRealisedPlGbp).toBe(10)
  })

  it("maps eToro open/close legs in ticker summaries", () => {
    const activity = [
      makeEvent({
        id: "etoro:pos-1",
        type: "buy",
        broker: "etoro",
        brokerLabel: "eToro",
        orderType: "Open",
        grossAmountGbp: 100,
      }),
      makeEvent({
        id: "etoro:pos-1",
        type: "sell",
        broker: "etoro",
        brokerLabel: "eToro",
        orderType: "Close",
        grossAmountGbp: 130,
        realisedProfitGbp: 30,
        timestamp: "2026-06-02T09:00:00Z",
      }),
    ]

    const summaries = buildTickerTradeSummaries(activity)

    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.buyCount).toBe(1)
    expect(summaries[0]?.sellCount).toBe(1)
    expect(summaries[0]?.netPlGbp).toBe(30)
  })
})
