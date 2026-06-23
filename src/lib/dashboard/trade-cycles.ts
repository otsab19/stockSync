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

export function sumClosedCycleRealisedPlGbp(activity: PortfolioActivityEvent[]) {
  return buildTradeCycles(activity)
    .filter((cycle) => cycle.sell && cycle.plGbp !== null)
    .reduce((sum, cycle) => sum + (cycle.plGbp ?? 0), 0)
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

function buildEtoroTradeCycles(etoroEvents: PortfolioActivityEvent[]) {
  const cycles: TradeCycle[] = []
  const openLotsByKey = new Map<string, OpenLot[]>()

  const sortedEvents = [...etoroEvents].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  )

  sortedEvents.forEach((event) => {
    const positionKey = getEtoroPositionId(event) ?? event.id

    if (isBuyLeg(event)) {
      const queue = openLotsByKey.get(positionKey) ?? []
      queue.push({ event, remainingShares: event.shares })
      openLotsByKey.set(positionKey, queue)
      return
    }

    const queue = openLotsByKey.get(positionKey) ?? []
    const { buys, plGbp } = matchSellAgainstFifoQueue(queue, event)
    openLotsByKey.set(positionKey, queue)

    const cycle = createTradeCycle(`etoro:${positionKey}:${event.id}`, buys, event, plGbp)
    if (cycle) cycles.push(cycle)
  })

  openLotsByKey.forEach((queue, positionKey) => {
    queue.forEach((lot) => {
      const cycle = createTradeCycle(`etoro:${positionKey}:${lot.event.id}:open`, [lot.event], undefined, null)
      if (cycle) cycles.push(cycle)
    })
  })

  return cycles
}

export function buildTradeCycles(activity: PortfolioActivityEvent[]): TradeCycle[] {
  const etoroEvents = activity.filter((event) => event.broker === "etoro")
  const otherEvents = activity.filter((event) => event.broker !== "etoro")
  const cycles = buildEtoroTradeCycles(etoroEvents)

  const sortedOtherEvents = [...otherEvents].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  )

  cycles.push(...buildBrokerFifoCycles(sortedOtherEvents))

  return cycles.sort(
    (left, right) => new Date(right.latestTimestamp).getTime() - new Date(left.latestTimestamp).getTime()
  )
}

export type TradeCycleGroup = {
  key: string
  label: string
  detail?: string
  cycles: TradeCycle[]
  netPlGbp: number
}

export type TradeCycleGroupBy = "none" | "ticker" | "broker" | "type"

export function groupTradeCyclesByStock(cycles: TradeCycle[]): TradeCycleGroup[] {
  const groups = new Map<string, TradeCycleGroup & { ticker: string; companyName: string; broker: BrokerId; brokerLabel: string }>()

  cycles.forEach((cycle) => {
    const key = `${cycle.ticker}:${cycle.broker}`
    const existing = groups.get(key) ?? {
      key,
      ticker: cycle.ticker,
      companyName: cycle.companyName,
      broker: cycle.broker,
      brokerLabel: cycle.brokerLabel,
      label: cycle.ticker,
      detail: cycle.brokerLabel,
      cycles: [],
      netPlGbp: 0,
    }

    existing.cycles.push(cycle)
    if (cycle.plGbp !== null) existing.netPlGbp += cycle.plGbp
    groups.set(key, existing)
  })

  return Array.from(groups.values())
    .map(({ label, detail, cycles: groupedCycles, netPlGbp, key }) => ({
      key,
      label,
      detail: `${detail} · ${groupedCycles.length} round trip${groupedCycles.length === 1 ? "" : "s"}`,
      cycles: groupedCycles,
      netPlGbp,
    }))
    .sort(
      (left, right) => new Date(right.cycles[0]?.latestTimestamp ?? 0).getTime() - new Date(left.cycles[0]?.latestTimestamp ?? 0).getTime()
    )
}

export function groupTradeCyclesByBroker(cycles: TradeCycle[]): TradeCycleGroup[] {
  const groups = new Map<string, TradeCycleGroup>()

  cycles.forEach((cycle) => {
    const existing = groups.get(cycle.broker) ?? {
      key: cycle.broker,
      label: cycle.brokerLabel,
      cycles: [],
      netPlGbp: 0,
    }

    existing.cycles.push(cycle)
    if (cycle.plGbp !== null) existing.netPlGbp += cycle.plGbp
    groups.set(cycle.broker, existing)
  })

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      detail: `${group.cycles.length} round trip${group.cycles.length === 1 ? "" : "s"}`,
    }))
    .sort(
      (left, right) => new Date(right.cycles[0]?.latestTimestamp ?? 0).getTime() - new Date(left.cycles[0]?.latestTimestamp ?? 0).getTime()
    )
}

export function groupTradeCyclesBySide(cycles: TradeCycle[]): TradeCycleGroup[] {
  const buyCycles: TradeCycle[] = []
  const sellCycles: TradeCycle[] = []

  cycles.forEach((cycle) => {
    cycle.buys.forEach((buy, index) => {
      const buyOnlyCycle = createTradeCycle(`${cycle.id}:buy:${index}`, [buy], undefined, null)
      if (buyOnlyCycle) buyCycles.push(buyOnlyCycle)
    })

    if (cycle.sell) {
      const sellOnlyCycle = createTradeCycle(`${cycle.id}:sell`, [], cycle.sell, cycle.plGbp)
      if (sellOnlyCycle) sellCycles.push(sellOnlyCycle)
    }
  })

  const sortByLatest = (left: TradeCycle, right: TradeCycle) =>
    new Date(right.latestTimestamp).getTime() - new Date(left.latestTimestamp).getTime()

  return [
    {
      key: "buys",
      label: "Buys",
      detail: `${buyCycles.length} buy leg${buyCycles.length === 1 ? "" : "s"}`,
      cycles: buyCycles.sort(sortByLatest),
      netPlGbp: 0,
    },
    {
      key: "sells",
      label: "Sells",
      detail: `${sellCycles.length} sell leg${sellCycles.length === 1 ? "" : "s"}`,
      cycles: sellCycles.sort(sortByLatest),
      netPlGbp: sellCycles.reduce((sum, cycle) => sum + (cycle.plGbp ?? 0), 0),
    },
  ]
}

export function groupTradeCycles(cycles: TradeCycle[], groupBy: TradeCycleGroupBy): TradeCycleGroup[] {
  switch (groupBy) {
    case "broker":
      return groupTradeCyclesByBroker(cycles)
    case "type":
      return groupTradeCyclesBySide(cycles)
    case "none":
      return [{
        key: "all",
        label: "All trades",
        detail: `${cycles.length} round trip${cycles.length === 1 ? "" : "s"}`,
        cycles,
        netPlGbp: cycles.reduce((sum, cycle) => sum + (cycle.plGbp ?? 0), 0),
      }]
    case "ticker":
    default:
      return groupTradeCyclesByStock(cycles)
  }
}
