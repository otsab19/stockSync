import type { BrokerInstrumentQuote } from "@/lib/integrations/provider"
import type { OrderPreview, TradeOrderRequest } from "@/types/orders"

const DEFAULT_MAX_ORDER_NOTIONAL_GBP = 1000
const GBP_USD_FALLBACK = 1.27

function getMaxOrderNotionalGbp() {
  const parsed = Number(process.env.MAX_ORDER_NOTIONAL_GBP)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ORDER_NOTIONAL_GBP
}

export function isLiveTradingEnabled() {
  return process.env.ENABLE_LIVE_TRADING === "true"
}

export function getRequiredConfirmation(order: Pick<TradeOrderRequest, "side" | "ticker">) {
  return `${order.side.toUpperCase()} ${order.ticker.trim().toUpperCase()}`
}

export function normalizePositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function estimateOrderNotionalGbp(order: TradeOrderRequest, quote?: BrokerInstrumentQuote | null) {
  if (order.inputMode === "value" && order.value) {
    return quote?.nativeCurrency === "USD" ? order.value / GBP_USD_FALLBACK : order.value
  }

  const price = order.limitPrice ?? order.stopPrice ?? quote?.livePrice
  if (!order.quantity || !price) return null

  const nativeNotional = order.quantity * price
  return quote?.nativeCurrency === "USD" ? nativeNotional / GBP_USD_FALLBACK : nativeNotional
}

export function validateOrderRequest(order: TradeOrderRequest, quote?: BrokerInstrumentQuote | null) {
  const errors: string[] = []

  if (!["t212", "etoro"].includes(order.broker)) errors.push("Unsupported broker.")
  if (!order.ticker.trim()) errors.push("Ticker is required.")
  if (!order.instrumentId.trim()) errors.push("Instrument id is required.")
  if (!["buy", "sell"].includes(order.side)) errors.push("Choose buy or sell.")
  if (!["market", "limit", "stop", "stop_limit"].includes(order.orderType)) errors.push("Choose a valid order type.")

  const quantity = normalizePositiveNumber(order.quantity)
  const value = normalizePositiveNumber(order.value)

  if (order.inputMode === "quantity" && !quantity) errors.push("Enter a positive quantity.")
  if (order.inputMode === "value" && !value) errors.push("Enter a positive order value.")
  if (order.broker === "t212" && order.inputMode !== "quantity") errors.push("Trading 212 order API only supports quantity orders.")

  if ((order.orderType === "limit" || order.orderType === "stop_limit") && !normalizePositiveNumber(order.limitPrice)) {
    errors.push("Limit price is required for limit and stop-limit orders.")
  }
  if ((order.orderType === "stop" || order.orderType === "stop_limit") && !normalizePositiveNumber(order.stopPrice)) {
    errors.push("Stop price is required for stop and stop-limit orders.")
  }
  if (order.stopLossPrice !== undefined && !normalizePositiveNumber(order.stopLossPrice)) errors.push("Stop-loss price must be positive.")
  if (order.takeProfitPrice !== undefined && !normalizePositiveNumber(order.takeProfitPrice)) errors.push("Take-profit price must be positive.")

  const estimatedNotionalGbp = estimateOrderNotionalGbp(order, quote)
  if (estimatedNotionalGbp !== null && estimatedNotionalGbp > getMaxOrderNotionalGbp()) {
    errors.push(`Estimated notional exceeds the configured max order size of £${getMaxOrderNotionalGbp().toFixed(0)}.`)
  }

  return { errors, estimatedNotionalGbp }
}

export function buildOrderPreview(order: TradeOrderRequest, quote?: BrokerInstrumentQuote | null): OrderPreview {
  const validation = validateOrderRequest(order, quote)
  const warnings = [
    ...validation.errors,
    "Live order endpoints can create real-money trades.",
    "Broker order APIs may not be idempotent; do not retry manually unless the app shows the order failed.",
  ]

  return {
    broker: order.broker,
    ticker: order.ticker.trim().toUpperCase(),
    side: order.side,
    orderType: order.orderType,
    inputMode: order.inputMode,
    signedQuantity: order.quantity ? order.quantity * (order.side === "buy" ? 1 : -1) : undefined,
    estimatedNotional: validation.estimatedNotionalGbp ?? undefined,
    currency: quote?.nativeCurrency ?? "GBP",
    requiredConfirmation: getRequiredConfirmation(order),
    warnings,
  }
}

export function assertOrderCanSubmit(order: TradeOrderRequest, quote?: BrokerInstrumentQuote | null) {
  if (!isLiveTradingEnabled()) {
    throw new Error("Live trading is disabled. Set ENABLE_LIVE_TRADING=true to enable order submission.")
  }

  const validation = validateOrderRequest(order, quote)
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join(" "))
  }

  const requiredConfirmation = getRequiredConfirmation(order)
  if (order.confirmationText?.trim().toUpperCase() !== requiredConfirmation) {
    throw new Error(`Type ${requiredConfirmation} to confirm this live order.`)
  }
}
