import type { BrokerId, PortfolioActivityEvent } from "@/types/portfolio"

export type TradeCycle = {
  id: string
  ticker: string
  companyName: string
  broker: BrokerId
  brokerLabel: string
  buy?: PortfolioActivityEvent
  sell?: PortfolioActivityEvent
  plGbp: number | null
  latestTimestamp: string
}

function getEtoroPositionId(event: PortfolioActivityEvent) {
  if (event.broker !== "etoro") return null
  return event.id.split(":")[1] ?? null
}

function isBuyLeg(event: PortfolioActivityEvent) {
  if (event.broker === "etoro" && event.orderType === "Open") return true
  if (event.broker === "etoro" && event.orderType === "Close") return false
  return event.type === "buy"
}

export function computeTradeCyclePl(buy: PortfolioActivityEvent | undefined, sell: PortfolioActivityEvent | undefined) {
  if (!sell) return null
  if (sell.realisedProfitGbp !== undefined) return sell.realisedProfitGbp
  if (buy) return sell.grossAmountGbp - buy.grossAmountGbp
  return null
}

function createTradeCycle(
  id: string,
  buy: PortfolioActivityEvent | undefined,
  sell: PortfolioActivityEvent | undefined
): TradeCycle | null {
  const anchor = sell ?? buy
  if (!anchor) return null

  return {
    id,
    ticker: anchor.ticker,
    companyName: anchor.companyName,
    broker: anchor.broker,
    brokerLabel: anchor.brokerLabel,
    buy,
    sell,
    plGbp: computeTradeCyclePl(buy, sell),
    latestTimestamp: sell?.timestamp ?? buy?.timestamp ?? anchor.timestamp,
  }
}

export function buildTradeCycles(activity: PortfolioActivityEvent[]): TradeCycle[] {
  const cycles: TradeCycle[] = []
  const etoroPairs = new Map<string, { open?: PortfolioActivityEvent; close?: PortfolioActivityEvent }>()
  const otherEvents: PortfolioActivityEvent[] = []

  activity.forEach((event) => {
    const positionId = getEtoroPositionId(event)
    if (positionId) {
      const pair = etoroPairs.get(positionId) ?? {}
      if (isBuyLeg(event)) pair.open = event
      else pair.close = event
      etoroPairs.set(positionId, pair)
      return
    }

    otherEvents.push(event)
  })

  etoroPairs.forEach((pair, positionId) => {
    const cycle = createTradeCycle(`etoro-cycle:${positionId}`, pair.open, pair.close)
    if (cycle) cycles.push(cycle)
  })

  const sortedOtherEvents = [...otherEvents].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  )
  const buyQueues = new Map<string, PortfolioActivityEvent[]>()

  sortedOtherEvents.forEach((event) => {
    const bucketKey = `${event.ticker}:${event.broker}`

    if (event.type === "buy") {
      const queue = buyQueues.get(bucketKey) ?? []
      queue.push(event)
      buyQueues.set(bucketKey, queue)
      return
    }

    const queue = buyQueues.get(bucketKey) ?? []
    const matchedBuy = queue.shift()
    const cycle = createTradeCycle(`${bucketKey}:${event.id}`, matchedBuy, event)
    if (cycle) cycles.push(cycle)
  })

  buyQueues.forEach((queue, bucketKey) => {
    queue.forEach((buy) => {
      const cycle = createTradeCycle(`${bucketKey}:${buy.id}:open`, buy, undefined)
      if (cycle) cycles.push(cycle)
    })
  })

  return cycles.sort(
    (left, right) => new Date(right.latestTimestamp).getTime() - new Date(left.latestTimestamp).getTime()
  )
}

export function groupTradeCyclesByStock(cycles: TradeCycle[]) {
  const groups = new Map<string, { key: string; ticker: string; companyName: string; broker: BrokerId; brokerLabel: string; cycles: TradeCycle[]; netPlGbp: number }>()

  cycles.forEach((cycle) => {
    const key = `${cycle.ticker}:${cycle.broker}`
    const existing = groups.get(key) ?? {
      key,
      ticker: cycle.ticker,
      companyName: cycle.companyName,
      broker: cycle.broker,
      brokerLabel: cycle.brokerLabel,
      cycles: [],
      netPlGbp: 0,
    }

    existing.cycles.push(cycle)
    if (cycle.plGbp !== null) existing.netPlGbp += cycle.plGbp
    groups.set(key, existing)
  })

  return Array.from(groups.values()).sort(
    (left, right) => new Date(right.cycles[0]?.latestTimestamp ?? 0).getTime() - new Date(left.cycles[0]?.latestTimestamp ?? 0).getTime()
  )
}
