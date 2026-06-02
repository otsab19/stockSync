import { describe, expect, it } from "vitest"
import {
  filterActivityByDateRange,
  formatDateRangeLabel,
  getActivitySide,
  getDateRangeForPreset,
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

  it("defaults preset ranges to today", () => {
    const { start, end } = getDateRangeForPreset("today")
    expect(start.getHours()).toBe(0)
    expect(end.getHours()).toBe(23)
    expect(start.toDateString()).toBe(end.toDateString())
  })

  it("maps eToro open and close legs to buy and sell", () => {
    expect(getActivitySide(makeEvent({ id: "a", type: "buy", broker: "etoro", orderType: "Open" }))).toBe("buy")
    expect(getActivitySide(makeEvent({ id: "b", type: "sell", broker: "etoro", orderType: "Close" }))).toBe("sell")
  })

  it("summarises buys and sells for the selected period", () => {
    const activity = [
      makeEvent({ id: "a", type: "buy", grossAmountGbp: 100 }),
      makeEvent({ id: "b", type: "sell", grossAmountGbp: 150 }),
    ]

    expect(summarizeActivityPeriod(activity)).toEqual({
      buyCount: 1,
      sellCount: 1,
      totalBoughtGbp: 100,
      totalSoldGbp: 150,
      netCashFlowGbp: 50,
    })
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
})
