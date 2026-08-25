import type { BrokerId, PortfolioPosition } from "@/types/portfolio"

export type TickerBrokerBreakdown = {
  broker: BrokerId
  brokerLabel: string
  shares: number
  avgPrice: number
}

export type TickerAggregate = {
  ticker: string
  companyName: string
  totalShares: number
  avgPrice: number
  livePrice: number
  currency: "GBP" | "USD"
  isFxNormalized: boolean
  brokers: TickerBrokerBreakdown[]
  brokerCount: number
}

export type NewAverageProjection = {
  newShares: number
  newTotalShares: number
  newAvg: number
  avgChange: number
  avgChangePercent: number
}

export function groupPositionsByTicker(portfolio: PortfolioPosition[]): Map<string, PortfolioPosition[]> {
  const map = new Map<string, PortfolioPosition[]>()
  for (const position of portfolio) {
    const existing = map.get(position.ticker)
    if (existing) existing.push(position)
    else map.set(position.ticker, [position])
  }
  return map
}

export function combineTickerLots(positions: PortfolioPosition[]): TickerAggregate | null {
  if (positions.length === 0) return null

  const currencies = new Set(positions.map((position) => position.nativeCurrency))
  const isFxNormalized = currencies.size > 1
  const currency: "GBP" | "USD" = isFxNormalized ? "GBP" : positions[0].nativeCurrency

  const toAggregateCurrency = (value: number, position: PortfolioPosition) =>
    isFxNormalized ? value * position.fxRateToGbp : value

  let totalShares = 0
  let totalCost = 0
  let totalLiveValue = 0
  const brokerMap = new Map<BrokerId, { broker: BrokerId; brokerLabel: string; shares: number; cost: number }>()

  for (const position of positions) {
    const avgPrice = toAggregateCurrency(position.avgPrice, position)
    const livePrice = toAggregateCurrency(position.livePrice, position)
    totalShares += position.shares
    totalCost += position.shares * avgPrice
    totalLiveValue += position.shares * livePrice

    const brokerEntry = brokerMap.get(position.broker) ?? {
      broker: position.broker,
      brokerLabel: position.brokerLabel,
      shares: 0,
      cost: 0,
    }
    brokerEntry.shares += position.shares
    brokerEntry.cost += position.shares * avgPrice
    brokerMap.set(position.broker, brokerEntry)
  }

  if (totalShares <= 0) return null

  return {
    ticker: positions[0].ticker,
    companyName: positions[0].companyName,
    totalShares,
    avgPrice: totalCost / totalShares,
    livePrice: totalLiveValue / totalShares,
    currency,
    isFxNormalized,
    brokers: Array.from(brokerMap.values()).map((entry) => ({
      broker: entry.broker,
      brokerLabel: entry.brokerLabel,
      shares: entry.shares,
      avgPrice: entry.shares > 0 ? entry.cost / entry.shares : 0,
    })),
    brokerCount: brokerMap.size,
  }
}

export function projectNewAverage(input: {
  totalShares: number
  avgPrice: number
  buyAmount: number
  buyPrice: number
}): NewAverageProjection | null {
  const { totalShares, avgPrice, buyAmount, buyPrice } = input
  if (totalShares <= 0 || buyPrice <= 0 || buyAmount < 0) return null

  const newShares = buyAmount / buyPrice
  const newTotalShares = totalShares + newShares
  const newAvg = (totalShares * avgPrice + newShares * buyPrice) / newTotalShares
  const avgChange = newAvg - avgPrice

  return {
    newShares,
    newTotalShares,
    newAvg,
    avgChange,
    avgChangePercent: avgPrice > 0 ? (avgChange / avgPrice) * 100 : 0,
  }
}
