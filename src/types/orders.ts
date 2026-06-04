import type { BrokerId } from "@/types/portfolio"
import type { Json } from "@/types/supabase"

export type OrderBroker = Extract<BrokerId, "t212" | "etoro">
export type OrderSide = "buy" | "sell"
export type OrderType = "market" | "limit" | "stop" | "stop_limit"
export type OrderInputMode = "quantity" | "value"
export type OrderTimeValidity = "DAY" | "GOOD_TILL_CANCEL"
export type OrderStatus = "draft" | "pending_confirmation" | "submitted" | "accepted" | "rejected" | "failed" | "cancelled"

export type OrderCapability = {
  broker: OrderBroker
  supportedOrderTypes: OrderType[]
  supportsValueOrders: boolean
  supportsStopLoss: boolean
  supportsTakeProfit: boolean
  supportsCancel: boolean
}

export type TradeOrderRequest = {
  broker: OrderBroker
  instrumentId: string
  ticker: string
  companyName?: string
  side: OrderSide
  orderType: OrderType
  inputMode: OrderInputMode
  quantity?: number
  value?: number
  limitPrice?: number
  stopPrice?: number
  stopLossPrice?: number
  takeProfitPrice?: number
  timeValidity?: OrderTimeValidity
  leverage?: number
  idempotencyKey: string
  confirmationText?: string
}

export type OrderPreview = {
  broker: OrderBroker
  ticker: string
  side: OrderSide
  orderType: OrderType
  inputMode: OrderInputMode
  signedQuantity?: number
  estimatedNotional?: number
  currency: "GBP" | "USD"
  requiredConfirmation: string
  warnings: string[]
}

export type BrokerOrderResult = {
  brokerOrderId?: string | null
  status: "accepted" | "rejected" | "submitted"
  rawResponse: Json
}

export type OrderRequestRow = {
  id: string
  userId: string
  broker: OrderBroker
  instrumentId: string
  ticker: string
  companyName: string
  side: OrderSide
  orderType: OrderType
  inputMode: OrderInputMode
  quantity: number | null
  value: number | null
  limitPrice: number | null
  stopPrice: number | null
  stopLossPrice: number | null
  takeProfitPrice: number | null
  timeValidity: OrderTimeValidity | null
  leverage: number
  status: OrderStatus
  idempotencyKey: string
  brokerOrderId: string | null
  rawRequest: Json
  rawResponse: Json | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  submittedAt: string | null
}
