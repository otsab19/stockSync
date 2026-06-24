import type { BrokerId } from "@/types/portfolio"

export type PendingOrderSide = "buy" | "sell"
export type PendingOrderType = "market" | "limit" | "stop" | "stop_limit" | "mit" | "unknown"
export type PendingOrderCancelKind = "generic" | "open_market" | "limit" | "close"

export type PendingBrokerOrder = {
  broker: Extract<BrokerId, "t212" | "etoro">
  brokerLabel: string
  brokerOrderId: string
  ticker: string
  companyName: string
  side: PendingOrderSide
  orderType: PendingOrderType
  quantity: number | null
  limitPrice: number | null
  stopPrice: number | null
  createdAt: string | null
  cancelKind: PendingOrderCancelKind
}

export type ClosePositionRequest = {
  broker: Extract<BrokerId, "t212" | "etoro">
  positionId: string
  instrumentId: string
  ticker: string
  unitsToClose?: number | null
  confirmationText?: string
}

export type MarketCandleInterval =
  | "OneMinute"
  | "FiveMinutes"
  | "FifteenMinutes"
  | "OneHour"
  | "OneDay"

export type MarketCandle = {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}
