import { buildTradeCycles, sumClosedCycleRealisedPlGbp } from "@/lib/dashboard/trade-cycles"
import type { BrokerId, PortfolioActivityEvent } from "@/types/portfolio"

export type ActivityDatePreset = "today" | "yesterday" | "this-week" | "this-month" | "last-7d" | "last-30d" | "custom"
export type PlGroupBy = "day" | "week" | "month" | "year"

export type PlPeriodBucket = {
  key: string
  label: string
  start: Date
  end: Date
  realisedPlGbp: number
  buyCount: number
  sellCount: number
  totalBoughtGbp: number
  totalSoldGbp: number
  events: PortfolioActivityEvent[]
}

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
    case "this-week":
      return { start: startOfWeek(now), end: todayEnd }
    case "this-month":
      return { start: startOfMonth(now), end: todayEnd }
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
  if (event.type === "buy" || event.type === "sell") {
    if (event.broker === "etoro" && event.orderType === "Open") return "buy"
    if (event.broker === "etoro" && event.orderType === "Close") return "sell"
    return event.type
  }

  return "buy"
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

export type TickerBrokerPlGroup = {
  ticker: string
  companyName: string
  totalRealisedPlGbp: number
  brokers: Array<{
    broker: BrokerId
    brokerLabel: string
    realisedPlGbp: number
    sellCount: number
    buyCount: number
    events: PortfolioActivityEvent[]
  }>
}

export function groupActivityByTickerAndBroker(
  activity: PortfolioActivityEvent[],
  sellPlLookup: Map<string, number | null> = new Map()
): TickerBrokerPlGroup[] {
  const tickerMap = new Map<string, TickerBrokerPlGroup>()

  activity.forEach((event) => {
    const tickerGroup = tickerMap.get(event.ticker) ?? {
      ticker: event.ticker,
      companyName: event.companyName,
      totalRealisedPlGbp: 0,
      brokers: [],
    }

    let brokerGroup = tickerGroup.brokers.find((entry) => entry.broker === event.broker)
    if (!brokerGroup) {
      brokerGroup = {
        broker: event.broker,
        brokerLabel: event.brokerLabel,
        realisedPlGbp: 0,
        sellCount: 0,
        buyCount: 0,
        events: [],
      }
      tickerGroup.brokers.push(brokerGroup)
    }

    brokerGroup.events.push(event)
    if (getActivitySide(event) === "buy") {
      brokerGroup.buyCount += 1
    } else {
      brokerGroup.sellCount += 1
      const plGbp = getSellPlGbp(event, sellPlLookup)
      if (plGbp !== null) {
        brokerGroup.realisedPlGbp += plGbp
        tickerGroup.totalRealisedPlGbp += plGbp
      }
    }

    tickerMap.set(event.ticker, tickerGroup)
  })

  return Array.from(tickerMap.values())
    .map((group) => ({
      ...group,
      brokers: group.brokers
        .map((broker) => ({
          ...broker,
          events: sortActivityByTimestamp(broker.events),
        }))
        .sort((left, right) => right.realisedPlGbp - left.realisedPlGbp || left.brokerLabel.localeCompare(right.brokerLabel)),
    }))
    .sort((left, right) => Math.abs(right.totalRealisedPlGbp) - Math.abs(left.totalRealisedPlGbp) || left.ticker.localeCompare(right.ticker))
}

export function summarizeActivityPeriod(
  activity: PortfolioActivityEvent[],
  sellPlLookup: Map<string, number | null> = new Map()
): ActivityPeriodSummary {
  let buyCount = 0
  let sellCount = 0
  let totalBoughtGbp = 0
  let totalSoldGbp = 0

  activity.forEach((event) => {
    if (getActivitySide(event) === "buy") {
      buyCount += 1
      totalBoughtGbp += event.grossAmountGbp
      return
    }

    sellCount += 1
    totalSoldGbp += event.grossAmountGbp
  })

  return {
    buyCount,
    sellCount,
    totalBoughtGbp,
    totalSoldGbp,
    totalRealisedPlGbp: sumClosedCycleRealisedPlGbp(activity),
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
    if (event.type !== "buy" && event.type !== "sell") return
    if (getActivitySide(event) === "buy") buys.push(event)
    else sells.push(event)
  })

  return {
    buys: sortActivityByTimestamp(buys),
    sells: sortActivityByTimestamp(sells),
  }
}

export function startOfWeek(date: Date) {
  const next = startOfDay(date)
  const weekday = next.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  next.setDate(next.getDate() + diff)
  return next
}

export function endOfWeek(date: Date) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  return endOfDay(next)
}

export function startOfMonth(date: Date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1))
}

export function endOfMonth(date: Date) {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

export function startOfYear(date: Date) {
  return startOfDay(new Date(date.getFullYear(), 0, 1))
}

export function endOfYear(date: Date) {
  return endOfDay(new Date(date.getFullYear(), 11, 31))
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function getYearKey(date: Date) {
  return String(date.getFullYear())
}

export function getPlPeriodKey(timestamp: string | Date, groupBy: PlGroupBy) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)

  switch (groupBy) {
    case "day":
      return formatDateInputValue(date)
    case "week":
      return formatDateInputValue(startOfWeek(date))
    case "month":
      return getMonthKey(date)
    case "year":
      return getYearKey(date)
  }
}

export function getPlPeriodBounds(key: string, groupBy: PlGroupBy) {
  switch (groupBy) {
    case "day": {
      const date = parseDateInputValue(key)
      return { start: startOfDay(date), end: endOfDay(date) }
    }
    case "week": {
      const date = parseDateInputValue(key)
      return { start: startOfWeek(date), end: endOfWeek(date) }
    }
    case "month": {
      const [year, month] = key.split("-").map(Number)
      const date = new Date(year, month - 1, 1)
      return { start: startOfMonth(date), end: endOfMonth(date) }
    }
    case "year": {
      const date = new Date(Number(key), 0, 1)
      return { start: startOfYear(date), end: endOfYear(date) }
    }
  }
}

export function formatPlPeriodLabel(key: string, groupBy: PlGroupBy) {
  const shortFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const monthFormatter = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
  })
  const yearFormatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
  })

  switch (groupBy) {
    case "day":
      return shortFormatter.format(parseDateInputValue(key))
    case "week": {
      const { start, end } = getPlPeriodBounds(key, "week")
      return `${shortFormatter.format(start)} – ${shortFormatter.format(end)}`
    }
    case "month": {
      const [year, month] = key.split("-").map(Number)
      return monthFormatter.format(new Date(year, month - 1, 1))
    }
    case "year":
      return yearFormatter.format(new Date(Number(key), 0, 1))
  }
}

function createEmptyPlPeriodBucket(key: string, groupBy: PlGroupBy): PlPeriodBucket {
  const { start, end } = getPlPeriodBounds(key, groupBy)
  return {
    key,
    label: formatPlPeriodLabel(key, groupBy),
    start,
    end,
    realisedPlGbp: 0,
    buyCount: 0,
    sellCount: 0,
    totalBoughtGbp: 0,
    totalSoldGbp: 0,
    events: [],
  }
}

function* iteratePlPeriodKeys(rangeStart: Date, rangeEnd: Date, groupBy: PlGroupBy) {
  const cursor = startOfDay(rangeStart)
  const end = endOfDay(rangeEnd)

  switch (groupBy) {
    case "day": {
      while (cursor.getTime() <= end.getTime()) {
        yield formatDateInputValue(cursor)
        cursor.setDate(cursor.getDate() + 1)
      }
      return
    }
    case "week": {
      let current = startOfWeek(cursor)
      while (current.getTime() <= end.getTime()) {
        yield formatDateInputValue(current)
        current = new Date(current)
        current.setDate(current.getDate() + 7)
      }
      return
    }
    case "month": {
      let current = startOfMonth(cursor)
      while (current.getTime() <= end.getTime()) {
        yield getMonthKey(current)
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
      }
      return
    }
    case "year": {
      let current = startOfYear(cursor)
      while (current.getTime() <= end.getTime()) {
        yield getYearKey(current)
        current = new Date(current.getFullYear() + 1, 0, 1)
      }
    }
  }
}

export function buildPlPeriodSeries(
  activity: PortfolioActivityEvent[],
  sellPlLookup: Map<string, number | null>,
  groupBy: PlGroupBy,
  rangeStart: Date,
  rangeEnd: Date
): PlPeriodBucket[] {
  const buckets = new Map<string, PlPeriodBucket>()

  for (const key of iteratePlPeriodKeys(rangeStart, rangeEnd, groupBy)) {
    buckets.set(key, createEmptyPlPeriodBucket(key, groupBy))
  }

  filterActivityByDateRange(activity, rangeStart, rangeEnd).forEach((event) => {
    const key = getPlPeriodKey(event.timestamp, groupBy)
    const bucket = buckets.get(key) ?? createEmptyPlPeriodBucket(key, groupBy)
    bucket.events.push(event)
    buckets.set(key, bucket)
  })

  return Array.from(buckets.values())
    .map((bucket) => {
      const summary = summarizeActivityPeriod(bucket.events, sellPlLookup)
      return {
        ...bucket,
        realisedPlGbp: summary.totalRealisedPlGbp,
        buyCount: summary.buyCount,
        sellCount: summary.sellCount,
        totalBoughtGbp: summary.totalBoughtGbp,
        totalSoldGbp: summary.totalSoldGbp,
        events: sortActivityByTimestamp(bucket.events),
      }
    })
    .sort((left, right) => left.start.getTime() - right.start.getTime())
}
