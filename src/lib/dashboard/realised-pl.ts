import { buildTradeCycles } from "@/lib/dashboard/trade-cycles"
import type { BrokerAccountSnapshot } from "@/types/broker-account"
import type { BrokerId, PortfolioActivityEvent } from "@/types/portfolio"

export function isClosedSellEvent(event: PortfolioActivityEvent) {
  if (event.broker === "etoro" && event.orderType === "Close") {
    return true
  }

  return event.type === "sell"
}

export function resolveBrokerRealisedPlGbp(
  broker: BrokerId,
  activity: PortfolioActivityEvent[],
  accountSnapshot?: BrokerAccountSnapshot | null,
  preferAccountSnapshot = false
) {
  if (preferAccountSnapshot && accountSnapshot?.realizedPl != null) {
    return accountSnapshot.realizedPl
  }

  return activity
    .filter((event) => event.broker === broker && isClosedSellEvent(event) && event.realisedProfitGbp !== undefined)
    .reduce((sum, event) => sum + (event.realisedProfitGbp ?? 0), 0)
}

export function resolveTotalRealisedPlGbp(
  activity: PortfolioActivityEvent[],
  options?: {
    brokerAccounts?: Array<BrokerAccountSnapshot | null | undefined>
    preferAccountSnapshots?: boolean
  }
) {
  const brokerAccounts = options?.brokerAccounts ?? []
  const preferAccountSnapshots = options?.preferAccountSnapshots ?? false
  const brokers = new Set<BrokerId>([
    ...activity.map((event) => event.broker),
    ...brokerAccounts.map((account) => account?.broker).filter(Boolean) as BrokerId[],
  ])

  return Array.from(brokers).reduce((total, broker) => {
    const snapshot = brokerAccounts.find((account) => account?.broker === broker)
    return total + resolveBrokerRealisedPlGbp(broker, activity, snapshot, preferAccountSnapshots)
  }, 0)
}

export function buildBrokerReportedClosedCycles(activity: PortfolioActivityEvent[]) {
  return buildTradeCycles(activity).filter(
    (cycle) => cycle.sell && cycle.sell.realisedProfitGbp !== undefined
  )
}

export function sumBrokerReportedSellRealisedPlGbp(activity: PortfolioActivityEvent[]) {
  return activity
    .filter((event) => isClosedSellEvent(event) && event.realisedProfitGbp !== undefined)
    .reduce((sum, event) => sum + (event.realisedProfitGbp ?? 0), 0)
}
