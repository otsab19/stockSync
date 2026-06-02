import type {
  AlertStatus,
  PortfolioActivityEvent,
  AssetAllocation,
  AssetType,
  BrokerAllocation,
  BrokerId,
  CurrencyMode,
  PortfolioHistoryPoint,
  PortfolioInsights,
  PortfolioPosition,
} from "@/types/portfolio"

export interface FilterState {
  searchQuery: string
  brokers: BrokerId[]
  assetType: "all" | AssetType
  plStatus: "all" | "profitable" | "unprofitable" | "near-alert" | "top-gainers" | "top-losers"
  sortBy: "value" | "pl_absolute" | "pl_percentage" | "ticker"
  sortOrder: "asc" | "desc"
  currencyMode: CurrencyMode
}

export const defaultFilterState: FilterState = {
  searchQuery: "",
  brokers: [],
  assetType: "all",
  plStatus: "all",
  sortBy: "value",
  sortOrder: "desc",
  currencyMode: "normalized_gbp",
}

export function formatMoney(value: number, currency: "GBP" | "USD") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function getDisplayValue(position: PortfolioPosition, currencyMode: CurrencyMode) {
  if (currencyMode === "native") {
    return position.nativeTotalValue
  }

  return position.normalizedTotalValueGbp
}

export function getDisplayCurrency(position: PortfolioPosition, currencyMode: CurrencyMode) {
  return currencyMode === "native" ? position.nativeCurrency : "GBP"
}

export function getDisplayProfit(position: PortfolioPosition, currencyMode: CurrencyMode) {
  if (currencyMode === "native") {
    return position.nativeCurrency === "GBP"
      ? position.totalPL
      : position.totalPL / position.fxRateToGbp
  }

  return position.totalPL
}

export function filterPortfolio(portfolio: PortfolioPosition[], filters: FilterState) {
  const search = filters.searchQuery.trim().toLowerCase()

  const filtered = portfolio.filter((position) => {
    const matchesSearch = !search
      || position.ticker.toLowerCase().includes(search)
      || position.companyName.toLowerCase().includes(search)

    const matchesBroker = filters.brokers.length === 0 || filters.brokers.includes(position.broker)
    const matchesAssetType = filters.assetType === "all" || position.assetType === filters.assetType
    const matchesPlStatus =
      filters.plStatus === "all"
      || (filters.plStatus === "profitable" && position.totalPL >= 0)
      || (filters.plStatus === "unprofitable" && position.totalPL < 0)
      || (filters.plStatus === "near-alert" && position.alertStatus === "near-alert")
      || (filters.plStatus === "top-gainers" && position.recentChange > 0)
      || (filters.plStatus === "top-losers" && position.recentChange < 0)

    return matchesSearch && matchesBroker && matchesAssetType && matchesPlStatus
  })

  return filtered.sort((left, right) => {
    const direction = filters.sortOrder === "asc" ? 1 : -1

    switch (filters.sortBy) {
      case "ticker":
        return left.ticker.localeCompare(right.ticker) * direction
      case "pl_absolute":
        return (left.totalPL - right.totalPL) * direction
      case "pl_percentage":
        return (left.totalPLPercent - right.totalPLPercent) * direction
      case "value":
      default:
        return (left.normalizedTotalValueGbp - right.normalizedTotalValueGbp) * direction
    }
  })
}

export function filterActivity(activity: PortfolioActivityEvent[], portfolio: PortfolioPosition[]) {
  if (activity.length === 0 || portfolio.length === 0) {
    return []
  }

  const visiblePositionKeys = new Set(portfolio.map((position) => `${position.broker}:${position.ticker}`))

  return activity.filter((event) => visiblePositionKeys.has(`${event.broker}:${event.ticker}`))
}

export function buildLivePortfolioStats(portfolio: PortfolioPosition[]) {
  const totalPortfolioValueGbp = portfolio.reduce((sum, position) => sum + position.normalizedTotalValueGbp, 0)
  const totalInvestedGbp = portfolio.reduce(
    (sum, position) => sum + position.shares * position.avgPrice * position.fxRateToGbp,
    0
  )
  const unrealisedReturnGbp = portfolio.reduce((sum, position) => sum + position.totalPL, 0)

  return {
    totalInvestedGbp,
    totalPortfolioValueGbp,
    unrealisedReturnGbp,
    returnPercent: totalInvestedGbp > 0 ? (unrealisedReturnGbp / totalInvestedGbp) * 100 : 0,
  }
}

export function buildInsights(portfolio: PortfolioPosition[]): PortfolioInsights
export function buildInsights(portfolio: PortfolioPosition[], activity: PortfolioActivityEvent[]): PortfolioInsights
export function buildInsights(portfolio: PortfolioPosition[], activity: PortfolioActivityEvent[] = []): PortfolioInsights {
  const { totalInvestedGbp: totalCostBasis, totalPortfolioValueGbp, unrealisedReturnGbp: totalNetReturnGbp } = buildLivePortfolioStats(portfolio)
  const totalNetReturnPercent = totalCostBasis <= 0 ? 0 : (totalNetReturnGbp / totalCostBasis) * 100
  const activeAlertStates = portfolio.filter((position) => position.alertStatus === "near-alert").length

  const brokerMap = new Map<BrokerId, BrokerAllocation>()
  const allocationMap = new Map<string, AssetAllocation>()

  portfolio.forEach((position) => {
    const brokerEntry = brokerMap.get(position.broker)

    if (brokerEntry) {
      brokerEntry.valueGbp += position.normalizedTotalValueGbp
    } else {
      brokerMap.set(position.broker, {
        broker: position.broker,
        brokerLabel: position.brokerLabel,
        valueGbp: position.normalizedTotalValueGbp,
        percentage: 0,
      })
    }

    const assetEntry = allocationMap.get(position.ticker)

    if (assetEntry) {
      assetEntry.valueGbp += position.normalizedTotalValueGbp
    } else {
      allocationMap.set(position.ticker, {
        label: position.ticker,
        valueGbp: position.normalizedTotalValueGbp,
        percentage: 0,
      })
    }
  })

  const brokerDistribution = Array.from(brokerMap.values()).map((entry) => ({
    ...entry,
    percentage: totalPortfolioValueGbp === 0 ? 0 : (entry.valueGbp / totalPortfolioValueGbp) * 100,
  }))

  const assetAllocation = Array.from(allocationMap.values()).map((entry) => ({
    ...entry,
    percentage: totalPortfolioValueGbp === 0 ? 0 : (entry.valueGbp / totalPortfolioValueGbp) * 100,
  }))

  const activityByDay = new Map<string, { timestamp: string; buyValueGbp: number; sellValueGbp: number; tradeCount: number }>()

  activity
    .slice()
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .forEach((event) => {
      const day = new Date(event.timestamp)
      day.setHours(0, 0, 0, 0)
      const key = day.toISOString()
      const current = activityByDay.get(key) ?? {
        timestamp: key,
        buyValueGbp: 0,
        sellValueGbp: 0,
        tradeCount: 0,
      }

      if (event.type === "buy") {
        current.buyValueGbp += event.grossAmountGbp
      } else {
        current.sellValueGbp += event.grossAmountGbp
      }

      current.tradeCount += 1
      activityByDay.set(key, current)
    })

  let netInvestedGbp = 0
  const history: PortfolioHistoryPoint[] = Array.from(activityByDay.values()).map((entry) => {
    netInvestedGbp += entry.buyValueGbp - entry.sellValueGbp

    return {
      timestamp: entry.timestamp,
      portfolioValueGbp: netInvestedGbp,
      totalPlGbp: totalNetReturnGbp,
      buyValueGbp: entry.buyValueGbp,
      sellValueGbp: entry.sellValueGbp,
      netInvestedGbp,
      tradeCount: entry.tradeCount,
    }
  })

  return {
    totalPortfolioValueGbp,
    totalNetReturnGbp,
    totalNetReturnPercent,
    activeAlertStates,
    brokerDistribution,
    assetAllocation,
    history,
    activity,
  }
}

export function getAlertBadgeVariant(status: AlertStatus) {
  switch (status) {
    case "triggered":
      return "destructive"
    case "near-alert":
      return "secondary"
    case "stable":
    default:
      return "outline"
  }
}

