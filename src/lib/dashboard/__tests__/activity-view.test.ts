import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildPlPeriodSeries,
  buildSellPlLookup,
  filterActivityByDateRange,
  formatDateRangeLabel,
  getActivitySide,
  getDateRangeForPreset,
  getEarliestActivityDate,
  getSellPlGbp,
  groupActivityByTickerAndBroker,
  rangeCoversAllTradeActivity,
  splitActivityBySide,
  summarizeActivityPeriod,
} from "@/lib/dashboard/activity-view"
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

describe("activity view", () => {
  it("filters activity to a date range", () => {
    const activity = [
      makeEvent({ id: "a", type: "buy", timestamp: "2026-06-01T09:00:00Z" }),
      makeEvent({ id: "b", type: "sell", timestamp: "2026-05-30T09:00:00Z" }),
    ]

    const filtered = filterActivityByDateRange(
      activity,
      new Date(2026, 5, 1, 0, 0, 0, 0),
      new Date(2026, 5, 1, 23, 59, 59, 999)
    )

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe("a")
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("defaults preset ranges to today", () => {
    const { start, end } = getDateRangeForPreset("today")
    expect(start.getHours()).toBe(0)
    expect(end.getHours()).toBe(23)
    expect(start.toDateString()).toBe(end.toDateString())
  })

  it("returns this week from Monday through today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 25, 12, 0, 0))

    const { start, end } = getDateRangeForPreset("this-week")

    expect(start.getDay()).toBe(1)
    expect(start.getDate()).toBe(22)
    expect(end.getDate()).toBe(25)
    expect(end.getHours()).toBe(23)
  })

  it("returns this month from the first day through today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 25, 12, 0, 0))

    const { start, end } = getDateRangeForPreset("this-month")

    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(5)
    expect(end.getDate()).toBe(25)
    expect(end.getHours()).toBe(23)
  })

  it("returns this year from January 1 through today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 25, 12, 0, 0))

    const { start, end } = getDateRangeForPreset("this-year")

    expect(start.getMonth()).toBe(0)
    expect(start.getDate()).toBe(1)
    expect(end.getDate()).toBe(25)
    expect(end.getHours()).toBe(23)
  })

  it("returns since-start from earliest trade through today", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 25, 12, 0, 0))
    const earliest = new Date(2024, 2, 15, 10, 0, 0)

    const { start, end } = getDateRangeForPreset("since-start", { earliestActivity: earliest })

    expect(start.getFullYear()).toBe(2024)
    expect(start.getMonth()).toBe(2)
    expect(start.getDate()).toBe(15)
    expect(end.getDate()).toBe(25)
  })

  it("detects when a date range covers all trade activity", () => {
    const activity = [
      makeEvent({ id: "a", type: "buy", timestamp: "2024-03-01T10:00:00Z" }),
      makeEvent({ id: "b", type: "sell", timestamp: "2026-05-20T10:00:00Z" }),
    ]

    expect(
      rangeCoversAllTradeActivity(
        activity,
        new Date(2024, 0, 1),
        new Date(2026, 11, 31)
      )
    ).toBe(true)
    expect(
      rangeCoversAllTradeActivity(
        activity,
        new Date(2025, 0, 1),
        new Date(2026, 11, 31)
      )
    ).toBe(false)
  })

  it("uses broker account snapshots for full-range realised p/l", () => {
    const activity = [
      makeEvent({ id: "t212:sell-1", type: "sell", grossAmountGbp: 130 }),
      makeEvent({ id: "etoro:1:close", type: "sell", broker: "etoro", brokerLabel: "eToro", grossAmountGbp: 80, realisedProfitGbp: 648.37, orderType: "Close" }),
    ]
    const lookup = buildSellPlLookup(activity)

    const partial = summarizeActivityPeriod(activity, lookup)
    expect(partial.totalRealisedPlGbp).toBe(648.37)

    const withSnapshots = summarizeActivityPeriod(activity, lookup, {
      preferAccountSnapshots: true,
      brokerAccounts: [
        { broker: "t212", currency: "GBP", availableCash: null, investedAmount: null, totalEquity: null, holdingsValue: null, unrealizedPl: null, realizedPl: 455.44 },
        { broker: "etoro", currency: "GBP", availableCash: null, investedAmount: null, totalEquity: null, holdingsValue: null, unrealizedPl: null, realizedPl: 648.37 },
      ],
    })
    expect(withSnapshots.totalRealisedPlGbp).toBeCloseTo(1103.81, 2)
  })

  it("maps eToro open and close legs to buy and sell", () => {
    expect(getActivitySide(makeEvent({ id: "a", type: "buy", broker: "etoro", orderType: "Open" }))).toBe("buy")
    expect(getActivitySide(makeEvent({ id: "b", type: "sell", broker: "etoro", orderType: "Close" }))).toBe("sell")
  })

  it("summarises buys and sells for the selected period", () => {
    const activity = [
      makeEvent({ id: "a", type: "buy", grossAmountGbp: 100 }),
      makeEvent({ id: "b", type: "sell", grossAmountGbp: 150, realisedProfitGbp: 50 }),
    ]

    expect(summarizeActivityPeriod(activity)).toEqual({
      buyCount: 1,
      sellCount: 1,
      totalBoughtGbp: 100,
      totalSoldGbp: 150,
      totalRealisedPlGbp: 50,
    })
  })

  it("does not infer sell p/l from fifo when broker profit is missing", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", timestamp: "2026-06-01T09:00:00Z", grossAmountGbp: 100 }),
      makeEvent({ id: "t212:sell-1", type: "sell", timestamp: "2026-06-01T12:00:00Z", grossAmountGbp: 130 }),
    ]
    const lookup = buildSellPlLookup(activity)

    expect(getSellPlGbp(activity[1]!, lookup)).toBeNull()
    expect(summarizeActivityPeriod(activity, lookup).totalRealisedPlGbp).toBe(0)
  })

  it("filters by local calendar date rather than raw timestamp bounds", () => {
    const activity = [
      makeEvent({ id: "a", type: "buy", timestamp: "2026-06-01T17:15:00" }),
      makeEvent({ id: "b", type: "sell", timestamp: "2026-05-30T09:00:00" }),
    ]

    const filtered = filterActivityByDateRange(
      activity,
      new Date(2026, 5, 1, 0, 0, 0, 0),
      new Date(2026, 5, 1, 23, 59, 59, 999)
    )

    expect(filtered.map((event) => event.id)).toContain("a")
    expect(filtered.map((event) => event.id)).not.toContain("b")
  })

  it("splits activity into buy and sell lists", () => {
    const activity = [
      makeEvent({ id: "a", type: "buy" }),
      makeEvent({ id: "b", type: "sell" }),
    ]

    const { buys, sells } = splitActivityBySide(activity)
    expect(buys).toHaveLength(1)
    expect(sells).toHaveLength(1)
  })

  it("formats single-day and multi-day labels", () => {
    expect(formatDateRangeLabel(new Date(2026, 5, 1), new Date(2026, 5, 1))).toContain("Jun")
    expect(formatDateRangeLabel(new Date(2026, 4, 28), new Date(2026, 5, 1))).toContain("–")
  })

  it("groups period activity by ticker and broker p/l", () => {
    const activity = [
      makeEvent({ id: "t212:buy-1", type: "buy", ticker: "NVDA", grossAmountGbp: 100 }),
      makeEvent({ id: "t212:sell-1", type: "sell", ticker: "NVDA", grossAmountGbp: 130, realisedProfitGbp: 30 }),
      makeEvent({ id: "etoro:1:close", type: "sell", broker: "etoro", brokerLabel: "eToro", ticker: "NVDA", grossAmountGbp: 80, realisedProfitGbp: 20, orderType: "Close" }),
      makeEvent({ id: "t212:buy-2", type: "buy", ticker: "AAPL", grossAmountGbp: 50 }),
    ]
    const lookup = buildSellPlLookup(activity)
    const groups = groupActivityByTickerAndBroker(activity, lookup)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.ticker).toBe("NVDA")
    expect(groups[0]?.totalRealisedPlGbp).toBe(50)
    expect(groups[0]?.brokers).toHaveLength(2)
    expect(groups[0]?.brokers.map((broker) => broker.brokerLabel).sort()).toEqual(["Trading 212", "eToro"])
  })

  it("builds daily realised p/l buckets for a date range", () => {
    const activity = [
      makeEvent({ id: "a", type: "buy", timestamp: "2026-06-01T09:00:00Z", grossAmountGbp: 100 }),
      makeEvent({ id: "b", type: "sell", timestamp: "2026-06-01T12:00:00Z", grossAmountGbp: 130, realisedProfitGbp: 30 }),
      makeEvent({ id: "c", type: "sell", timestamp: "2026-06-02T12:00:00Z", grossAmountGbp: 80, realisedProfitGbp: -10 }),
    ]
    const lookup = buildSellPlLookup(activity)
    const series = buildPlPeriodSeries(
      activity,
      lookup,
      "day",
      new Date(2026, 5, 1, 0, 0, 0, 0),
      new Date(2026, 5, 2, 23, 59, 59, 999)
    )

    expect(series).toHaveLength(2)
    expect(series[0]?.realisedPlGbp).toBe(30)
    expect(series[0]?.events).toHaveLength(2)
    expect(series[1]?.realisedPlGbp).toBe(-10)
    expect(series[1]?.events).toHaveLength(1)
  })
})
