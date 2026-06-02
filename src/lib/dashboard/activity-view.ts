import { buildTradeCycles } from "@/lib/dashboard/trade-cycles"
import type { PortfolioActivityEvent } from "@/types/portfolio"

export type ActivityDatePreset = "today" | "yesterday" | "last-7d" | "last-30d" | "custom"

export type ActivityPeriodSummary = {
  buyCount: number
  sellCount: number
  totalBoughtGbp: number
  totalSoldGbp: number
  totalRealisedPlGbp: number
}

export function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function parseDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function getDateRangeForPreset(preset: ActivityDatePreset) {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)

  switch (preset) {
    case "yesterday": {
      const yesterday = new Date(todayStart)
      yesterday.setDate(yesterday.getDate() - 1)
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) }
    }
    case "last-7d": {
      const start = new Date(todayStart)
      start.setDate(start.getDate() - 6)
      return { start, end: todayEnd }
    }
    case "last-30d": {
      const start = new Date(todayStart)
      start.setDate(start.getDate() - 29)
      return { start, end: todayEnd }
    }
    case "custom":
    case "today":
    default:
      return { start: todayStart, end: todayEnd }
  }
}

export function formatDateRangeLabel(start: Date, end: Date) {
  const sameDay = start.toDateString() === end.toDateString()
  const longFormatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const shortFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  if (sameDay) return longFormatter.format(start)
  return `${shortFormatter.format(start)} – ${shortFormatter.format(end)}`
}

export function dedupeActivityEvents(activity: PortfolioActivityEvent[]) {
  const seen = new Set<string>()
  return activity.filter((event) => {
    if (seen.has(event.id)) return false
    seen.add(event.id)
    return true
  })
}

export function getActivitySide(event: PortfolioActivityEvent): "buy" | "sell" {
  if (event.broker === "etoro" && event.orderType === "Open") return "buy"
  if (event.broker === "etoro" && event.orderType === "Close") return "sell"
  return event.type
}

function toLocalDateKey(value: string | Date) {
  return formatDateInputValue(value instanceof Date ? value : new Date(value))
}

export function filterActivityByDateRange(
  activity: PortfolioActivityEvent[],
  start: Date,
  end: Date
) {
  const startKey = toLocalDateKey(start)
  const endKey = toLocalDateKey(end)

  return activity.filter((event) => {
    const eventKey = toLocalDateKey(event.timestamp)
    return eventKey >= startKey && eventKey <= endKey
  })
}

export function buildSellPlLookup(activity: PortfolioActivityEvent[]) {
  const lookup = new Map<string, number | null>()

  buildTradeCycles(activity).forEach((cycle) => {
    if (cycle.sell) lookup.set(cycle.sell.id, cycle.plGbp)
  })

  return lookup
}

export function getSellPlGbp(
  sell: PortfolioActivityEvent,
  plLookup: Map<string, number | null>
) {
  if (sell.realisedProfitGbp !== undefined) return sell.realisedProfitGbp
  return plLookup.get(sell.id) ?? null
}

export function summarizeActivityPeriod(
  activity: PortfolioActivityEvent[],
  sellPlLookup: Map<string, number | null> = new Map()
): ActivityPeriodSummary {
  let buyCount = 0
  let sellCount = 0
  let totalBoughtGbp = 0
  let totalSoldGbp = 0
  let totalRealisedPlGbp = 0

  activity.forEach((event) => {
    if (getActivitySide(event) === "buy") {
      buyCount += 1
      totalBoughtGbp += event.grossAmountGbp
      return
    }

    sellCount += 1
    totalSoldGbp += event.grossAmountGbp

    const plGbp = getSellPlGbp(event, sellPlLookup)
    if (plGbp !== null) totalRealisedPlGbp += plGbp
  })

  return {
    buyCount,
    sellCount,
    totalBoughtGbp,
    totalSoldGbp,
    totalRealisedPlGbp,
  }
}

export function sortActivityByTimestamp(
  activity: PortfolioActivityEvent[],
  order: "asc" | "desc" = "desc"
) {
  const direction = order === "asc" ? 1 : -1
  return [...activity].sort(
    (left, right) => (new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()) * direction
  )
}

export function splitActivityBySide(activity: PortfolioActivityEvent[]) {
  const buys: PortfolioActivityEvent[] = []
  const sells: PortfolioActivityEvent[] = []

  activity.forEach((event) => {
    if (getActivitySide(event) === "buy") buys.push(event)
    else sells.push(event)
  })

  return {
    buys: sortActivityByTimestamp(buys),
    sells: sortActivityByTimestamp(sells),
  }
}
