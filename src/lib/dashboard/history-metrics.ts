import {
  buildSellPlLookup,
  getActivitySide,
  summarizeActivityPeriod,
} from "@/lib/dashboard/activity-view"
import {
  buildTradeCycles,
  groupTradeCyclesByBroker,
  groupTradeCyclesByStock,
} from "@/lib/dashboard/trade-cycles"
import type { BrokerId, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"

export type OpenPositionMetrics = {
  valueGbp: number
  costBasisGbp: number
  unrealisedPlGbp: number
  unrealisedReturnPercent: number
  positionCount: number
}

export type HistoryTradeMetrics = {
  realisedPlGbp: number
  closedTradeCount: number
  winRate: number
  totalBoughtGbp: number
  totalSoldGbp: number
  closedCostBasisGbp: number
  realisedReturnPercent: number
}

export type BrokerPerformanceBreakdown = {
  broker: BrokerId
  brokerLabel: string
  realisedPlGbp: number
  openValueGbp: number
  unrealisedPlGbp: number
}

export type CumulativeRealisedPlPoint = {
  timestamp: string
  realisedPlGbp: number
  cumulativeRealisedPlGbp: number
}

export type MonthlyRealisedPlPoint = {
  month: string
  realisedPlGbp: number
  totalBoughtGbp: number
  totalSoldGbp: number
}

export type TickerTradeSummary = {
  ticker: string
  companyName: string
  broker: BrokerId
  brokerLabel: string
  tradeCount: number
  buyCount: number
  sellCount: number
  totalBoughtGbp: number
  totalSoldGbp: number
  netPlGbp: number
  closedTradeCount: number
}

export type HistoryPerformanceMetrics = {
  open: OpenPositionMetrics
  history: HistoryTradeMetrics
  brokers: BrokerPerformanceBreakdown[]
}

function closedCycleCostBasisGbp(sell: PortfolioActivityEvent, plGbp: number) {
  return sell.grossAmountGbp - plGbp
}

export function buildOpenPositionMetrics(portfolio: PortfolioPosition[]): OpenPositionMetrics {
  const valueGbp = portfolio.reduce((sum, position) => sum + position.normalizedTotalValueGbp, 0)
  const costBasisGbp = portfolio.reduce(
    (sum, position) => sum + position.shares * position.avgPrice * position.fxRateToGbp,
    0
  )
  const unrealisedPlGbp = portfolio.reduce((sum, position) => sum + position.totalPL, 0)

  return {
    valueGbp,
    costBasisGbp,
    unrealisedPlGbp,
    unrealisedReturnPercent: costBasisGbp > 0 ? (unrealisedPlGbp / costBasisGbp) * 100 : 0,
    positionCount: portfolio.length,
  }
}

export function buildHistoryTradeMetrics(activity: PortfolioActivityEvent[]): HistoryTradeMetrics {
  const sellPlLookup = buildSellPlLookup(activity)
  const periodSummary = summarizeActivityPeriod(activity, sellPlLookup)
  const cycles = buildTradeCycles(activity)
  const closedCycles = cycles.filter((cycle) => cycle.sell && cycle.plGbp !== null)

  const closedCostBasisGbp = closedCycles.reduce((sum, cycle) => {
    if (!cycle.sell || cycle.plGbp === null) return sum
    return sum + closedCycleCostBasisGbp(cycle.sell, cycle.plGbp)
  }, 0)

  const winningTrades = closedCycles.filter((cycle) => (cycle.plGbp ?? 0) > 0).length

  return {
    realisedPlGbp: periodSummary.totalRealisedPlGbp,
    closedTradeCount: closedCycles.length,
    winRate: closedCycles.length > 0 ? (winningTrades / closedCycles.length) * 100 : 0,
    totalBoughtGbp: periodSummary.totalBoughtGbp,
    totalSoldGbp: periodSummary.totalSoldGbp,
    closedCostBasisGbp,
    realisedReturnPercent:
      closedCostBasisGbp > 0 ? (periodSummary.totalRealisedPlGbp / closedCostBasisGbp) * 100 : 0,
  }
}

export function buildBrokerPerformanceBreakdown(
  portfolio: PortfolioPosition[],
  activity: PortfolioActivityEvent[]
): BrokerPerformanceBreakdown[] {
  const brokerLabels = new Map<BrokerId, string>()
  portfolio.forEach((position) => brokerLabels.set(position.broker, position.brokerLabel))
  activity.forEach((event) => brokerLabels.set(event.broker, event.brokerLabel))

  const openByBroker = new Map<BrokerId, { valueGbp: number; unrealisedPlGbp: number }>()
  portfolio.forEach((position) => {
    const current = openByBroker.get(position.broker) ?? { valueGbp: 0, unrealisedPlGbp: 0 }
    current.valueGbp += position.normalizedTotalValueGbp
    current.unrealisedPlGbp += position.totalPL
    openByBroker.set(position.broker, current)
  })

  const realisedByBroker = new Map(
    groupTradeCyclesByBroker(buildTradeCycles(activity)).map((group) => [group.key as BrokerId, group.netPlGbp])
  )

  return Array.from(brokerLabels.entries())
    .map(([broker, brokerLabel]) => {
      const open = openByBroker.get(broker) ?? { valueGbp: 0, unrealisedPlGbp: 0 }
      return {
        broker,
        brokerLabel,
        realisedPlGbp: realisedByBroker.get(broker) ?? 0,
        openValueGbp: open.valueGbp,
        unrealisedPlGbp: open.unrealisedPlGbp,
      }
    })
    .sort((left, right) => right.openValueGbp + right.realisedPlGbp - (left.openValueGbp + left.realisedPlGbp))
}

export function buildHistoryPerformanceMetrics(
  portfolio: PortfolioPosition[],
  activity: PortfolioActivityEvent[]
): HistoryPerformanceMetrics {
  return {
    open: buildOpenPositionMetrics(portfolio),
    history: buildHistoryTradeMetrics(activity),
    brokers: buildBrokerPerformanceBreakdown(portfolio, activity),
  }
}

export function buildCumulativeRealisedPlSeries(
  activity: PortfolioActivityEvent[]
): CumulativeRealisedPlPoint[] {
  const byDay = new Map<string, { timestamp: string; realisedPlGbp: number }>()

  buildTradeCycles(activity)
    .filter((cycle) => cycle.sell && cycle.plGbp !== null)
    .forEach((cycle) => {
      const sell = cycle.sell!
      const day = new Date(sell.timestamp)
      day.setHours(0, 0, 0, 0)
      const key = day.toISOString()
      const current = byDay.get(key) ?? { timestamp: key, realisedPlGbp: 0 }
      current.realisedPlGbp += cycle.plGbp ?? 0
      byDay.set(key, current)
    })

  let cumulativeRealisedPlGbp = 0
  return Array.from(byDay.values())
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .map((entry) => {
      cumulativeRealisedPlGbp += entry.realisedPlGbp
      return { ...entry, cumulativeRealisedPlGbp }
    })
}

export function buildMonthlyRealisedPl(activity: PortfolioActivityEvent[]): MonthlyRealisedPlPoint[] {
  const sellPlLookup = buildSellPlLookup(activity)
  const byMonth = new Map<string, MonthlyRealisedPlPoint>()

  activity.forEach((event) => {
    const date = new Date(event.timestamp)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    const current = byMonth.get(key) ?? {
      month: key,
      realisedPlGbp: 0,
      totalBoughtGbp: 0,
      totalSoldGbp: 0,
    }

    if (getActivitySide(event) === "buy") {
      current.totalBoughtGbp += event.grossAmountGbp
    } else {
      current.totalSoldGbp += event.grossAmountGbp
      const plGbp = sellPlLookup.get(event.id)
      if (plGbp !== undefined && plGbp !== null) current.realisedPlGbp += plGbp
    }

    byMonth.set(key, current)
  })

  return Array.from(byMonth.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value)
}

export function buildTickerTradeSummaries(activity: PortfolioActivityEvent[]): TickerTradeSummary[] {
  const activityStats = new Map<string, Omit<TickerTradeSummary, "netPlGbp" | "closedTradeCount">>()

  activity.forEach((event) => {
    const key = `${event.ticker}:${event.broker}`
    const existing = activityStats.get(key) ?? {
      ticker: event.ticker,
      companyName: event.companyName,
      broker: event.broker,
      brokerLabel: event.brokerLabel,
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      totalBoughtGbp: 0,
      totalSoldGbp: 0,
    }

    existing.tradeCount += 1
    if (getActivitySide(event) === "buy") {
      existing.buyCount += 1
      existing.totalBoughtGbp += event.grossAmountGbp
    } else {
      existing.sellCount += 1
      existing.totalSoldGbp += event.grossAmountGbp
    }

    activityStats.set(key, existing)
  })

  const plByTicker = new Map(
    groupTradeCyclesByStock(buildTradeCycles(activity)).map((group) => [
      group.key,
      {
        netPlGbp: group.netPlGbp,
        closedTradeCount: group.cycles.filter((cycle) => cycle.sell).length,
      },
    ])
  )

  return Array.from(activityStats.entries()).map(([key, stats]) => {
    const pl = plByTicker.get(key) ?? { netPlGbp: 0, closedTradeCount: 0 }
    return { ...stats, ...pl }
  })
}
