import type { BrokerId, PortfolioActivityEvent } from "@/types/portfolio"

const SHARE_EPSILON = 0.000001

export type TradeCycle = {
  id: string
  ticker: string
  companyName: string
  broker: BrokerId
  brokerLabel: string
  buys: PortfolioActivityEvent[]
  sell?: PortfolioActivityEvent
  plGbp: number | null
  latestTimestamp: string
}

type OpenLot = {
  event: PortfolioActivityEvent
  remainingShares: number
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
  buys: PortfolioActivityEvent[],
  sell: PortfolioActivityEvent | undefined,
  plGbp: number | null
): TradeCycle | null {
  const anchor = sell ?? buys[0]
  if (!anchor) return null

  return {
    id,
    ticker: anchor.ticker,
    companyName: anchor.companyName,
    broker: anchor.broker,
    brokerLabel: anchor.brokerLabel,
    buys,
    sell,
    plGbp,
    latestTimestamp: sell?.timestamp ?? buys[buys.length - 1]?.timestamp ?? anchor.timestamp,
  }
}

function matchSellAgainstFifoQueue(queue: OpenLot[], sell: PortfolioActivityEvent) {
  let remainingSellShares = sell.shares
  let costBasisGbp = 0
  const consumedBuys: PortfolioActivityEvent[] = []

  while (remainingSellShares > SHARE_EPSILON && queue.length > 0) {
    const lot = queue[0]
    const matchedShares = Math.min(remainingSellShares, lot.remainingShares)
    costBasisGbp += lot.event.grossAmountGbp * (matchedShares / lot.event.shares)

    if (!consumedBuys.includes(lot.event)) {
      consumedBuys.push(lot.event)
    }

    lot.remainingShares -= matchedShares
    remainingSellShares -= matchedShares

    if (lot.remainingShares <= SHARE_EPSILON) {
      queue.shift()
    }
  }

  const matchedSellShares = sell.shares - remainingSellShares
  const proceedsGbp = matchedSellShares > 0
    ? sell.grossAmountGbp * (matchedSellShares / sell.shares)
    : 0

  const plGbp = sell.realisedProfitGbp !== undefined
    ? sell.realisedProfitGbp
    : proceedsGbp - costBasisGbp

  return { buys: consumedBuys, plGbp }
}

function buildBrokerFifoCycles(sortedEvents: PortfolioActivityEvent[]) {
  const cycles: TradeCycle[] = []
  const buyQueues = new Map<string, OpenLot[]>()

  sortedEvents.forEach((event) => {
    const bucketKey = `${event.ticker}:${event.broker}`

    if (event.type === "buy") {
      const queue = buyQueues.get(bucketKey) ?? []
      queue.push({ event, remainingShares: event.shares })
      buyQueues.set(bucketKey, queue)
      return
    }

    const queue = buyQueues.get(bucketKey) ?? []
    const { buys, plGbp } = matchSellAgainstFifoQueue(queue, event)
    buyQueues.set(bucketKey, queue)

    const cycle = createTradeCycle(`${bucketKey}:${event.id}`, buys, event, plGbp)
    if (cycle) cycles.push(cycle)
  })

  buyQueues.forEach((queue, bucketKey) => {
    queue.forEach((lot) => {
      const cycle = createTradeCycle(`${bucketKey}:${lot.event.id}:open`, [lot.event], undefined, null)
      if (cycle) cycles.push(cycle)
    })
  })

  return cycles
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
    const buys = pair.open ? [pair.open] : []
    const cycle = createTradeCycle(
      `etoro-cycle:${positionId}`,
      buys,
      pair.close,
      computeTradeCyclePl(pair.open, pair.close)
    )
    if (cycle) cycles.push(cycle)
  })

  const sortedOtherEvents = [...otherEvents].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  )

  cycles.push(...buildBrokerFifoCycles(sortedOtherEvents))

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
