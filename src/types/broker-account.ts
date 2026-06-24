import type { BrokerId } from "@/types/portfolio"

export type BrokerAccountSnapshot = {
  broker: Extract<BrokerId, "t212" | "etoro">
  currency: "GBP" | "USD"
  availableCash: number | null
  investedAmount: number | null
  totalEquity: number | null
  holdingsValue: number | null
  unrealizedPl: number | null
  realizedPl?: number | null
}

export type BrokerSyncStats = {
  positionsMapped: number
  positionsStored: number
  activityImported: number
}
