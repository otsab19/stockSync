import { inferAssetType, normalizeImportedHolding, normalizeTickerSymbol } from "@/lib/portfolio/position-normalizer"
import { logger, getErrorLogDetails } from "@/lib/backend/logger"
import { getUsdToGbpRate } from "@/lib/fx"
import { buildOrderPreview } from "@/lib/orders/validation"
import type { BrokerInstrument } from "@/lib/integrations/provider"
import type { BrokerApiCredentials } from "@/types/integrations"
import type { BrokerOrderResult, OrderCapability, TradeOrderRequest } from "@/types/orders"
import type { PendingBrokerOrder, PendingOrderCancelKind } from "@/types/pending-orders"
import type { AssetType, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"
import type { Json } from "@/types/supabase"

const DEFAULT_TRADING212_API_BASE_URL = "https://live.trading212.com/api/v0"
const DEFAULT_TRADING212_HISTORY_PATH = "/equity/history/orders?limit=50"
const USD_TO_GBP_FALLBACK_RATE = 0.79 // kept as synchronous fallback for mappers; use getUsdToGbpRate() in sync entry-points
const TRADING212_HISTORY_PAGE_DELAY_MS = 11_000 // 6 req/min limit — keep safely below one request every 10s
const DEFAULT_TRADING212_HISTORY_MAX_PAGES = 50

type Trading212ApiRow = Record<string, unknown>

type Trading212ApiResponse = Trading212ApiRow[] | {
  items?: Trading212ApiRow[]
  data?: Trading212ApiRow[]
  positions?: Trading212ApiRow[]
  portfolio?: Trading212ApiRow[]
}

type Trading212HistoryResponse = {
  items?: Trading212ApiRow[]
  nextPagePath?: string | null
}

type Trading212InstrumentResponse = Trading212ApiRow[]
type Trading212OrderPayload = Record<string, string | number>

function getNestedValue(row: Trading212ApiRow, path: string) {
  return path
    .split(".")
    .reduce<unknown>((currentValue, segment) => (isRecord(currentValue) ? currentValue[segment] : undefined), row)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getStringValue(row: Trading212ApiRow, keys: string[]) {
  for (const key of keys) {
    const value = key.includes(".") ? getNestedValue(row, key) : row[key]

    if (typeof value === "string") {
      const trimmed = value.trim()

      if (trimmed) {
        return trimmed
      }
    }
  }

  return null
}

function getNumberValue(row: Trading212ApiRow, keys: string[]) {
  for (const key of keys) {
    const value = key.includes(".") ? getNestedValue(row, key) : row[key]

    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }

    if (typeof value === "string") {
      const parsed = Number(value.replaceAll(",", "").trim())

      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return null
}

function normalizeCurrency(value: string | null): PortfolioPosition["nativeCurrency"] | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toUpperCase()

  if (normalized === "GBP" || normalized === "USD") {
    return normalized
  }

  return null
}

function getConfiguredTrading212AccountCurrency(): PortfolioPosition["nativeCurrency"] | null {
  const value = process.env.TRADING212_ACCOUNT_CURRENCY?.trim().toUpperCase()
  if (value === "GBP" || value === "USD") return value
  return null
}

function getIdentifierValue(row: Trading212ApiRow, keys: string[]) {
  for (const key of keys) {
    const value = key.includes(".") ? getNestedValue(row, key) : row[key]

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value)
    }

    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }

  return null
}

function convertTrading212WalletAmountToGbp(
  amount: number,
  walletCurrency: PortfolioPosition["nativeCurrency"] | null,
  instrumentCurrency: PortfolioPosition["nativeCurrency"] | null,
  fxRate: number | null,
  nativeNotional: number | null,
  liveUsdToGbp = USD_TO_GBP_FALLBACK_RATE
) {
  const resolvedWalletCurrency = walletCurrency ?? getConfiguredTrading212AccountCurrency() ?? "GBP"

  if (resolvedWalletCurrency === "GBP") {
    return amount
  }

  if (resolvedWalletCurrency === "USD") {
    return amount * liveUsdToGbp
  }

  if (
    fxRate !== null
    && fxRate > 0
    && nativeNotional !== null
    && nativeNotional > 0
    && instrumentCurrency === "USD"
  ) {
    const impliedGbp = Math.abs(amount) / fxRate
    const fallbackGbp = nativeNotional * liveUsdToGbp
    if (Math.abs(impliedGbp - fallbackGbp) / Math.max(fallbackGbp, 1) < 0.35) {
      return impliedGbp
    }
  }

  return instrumentCurrency === "GBP" ? amount : amount * liveUsdToGbp
}

function formatTrading212BaseUrl() {
  return process.env.TRADING212_API_BASE_URL ?? DEFAULT_TRADING212_API_BASE_URL
}

function normalizeTrading212Path(pathOrUrl: string) {
  const trimmedPath = pathOrUrl.trim()

  if (!trimmedPath) {
    return trimmedPath
  }

  if (/^https?:\/\//i.test(trimmedPath)) {
    const baseUrl = new URL(formatTrading212BaseUrl())
    const requestUrl = new URL(trimmedPath)

    if (requestUrl.origin !== baseUrl.origin) {
      return trimmedPath
    }

    return `${requestUrl.pathname}${requestUrl.search}`
  }

  if (trimmedPath.startsWith("/api/v0/")) {
    return trimmedPath.slice("/api/v0".length)
  }

  if (trimmedPath.startsWith("api/v0/")) {
    return `/${trimmedPath.slice("api/v0".length)}`
  }

  return trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`
}

function normalizeTrading212AssetType(row: Trading212ApiRow, companyName: string): AssetType {
  const explicitType = getStringValue(row, ["type", "instrumentType", "assetType", "category"])

  if (!explicitType) {
    return inferAssetType(companyName)
  }

  return inferAssetType(explicitType, inferAssetType(companyName))
}

function mapTrading212InstrumentRow(row: Trading212ApiRow): BrokerInstrument | null {
  const rawTicker = getStringValue(row, ["ticker", "symbol", "instrumentCode"])
  const companyName = getStringValue(row, ["name", "shortName", "displayName", "instrumentName"]) ?? rawTicker
  const currency = normalizeCurrency(getStringValue(row, ["currencyCode", "currency"]))
  const type = getStringValue(row, ["type", "instrumentType", "assetType"])?.toUpperCase()

  if (!rawTicker || !companyName || !currency) {
    return null
  }

  if (type && !["STOCK", "ETF"].includes(type)) {
    return null
  }

  return {
    broker: "t212",
    id: rawTicker,
    ticker: normalizeTickerSymbol(rawTicker),
    companyName,
    nativeCurrency: currency,
    assetType: type === "ETF" ? "etf" : "stock",
    isQuoteAvailable: false,
  }
}

function extractTrading212Rows(payload: unknown): Trading212ApiRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    throw new Error("Trading 212 returned an unexpected response format.")
  }

  const candidates = [payload.items, payload.data, payload.positions, payload.portfolio]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
  }

  throw new Error("Trading 212 returned an unexpected portfolio payload.")
}

function mapTrading212RowToPosition(row: Trading212ApiRow): PortfolioPosition | null {
  const ticker = getStringValue(row, ["instrument.ticker", "ticker", "symbol", "instrumentCode", "isin", "instrument.isin"])
  const shares = getNumberValue(row, ["quantity", "ownedQuantity", "qty", "shares"])
  const walletCurrency = normalizeCurrency(getStringValue(row, ["walletImpact.currency", "accountCurrency"]))
  const instrumentCurrency = normalizeCurrency(getStringValue(row, ["currencyCode", "currency", "instrument.currency", "instrumentCurrency", "instrumentCurrencyCode", "instrument.currencyCode"]))
  const currency = instrumentCurrency ?? walletCurrency
  const totalCost = getNumberValue(row, ["walletImpact.totalCost"])
  const currentValue = getNumberValue(row, ["walletImpact.currentValue"])
  const averagePrice = getNumberValue(row, ["averagePricePaid", "averagePrice", "avgPrice", "priceAvg", "weightedAveragePrice"])
    ?? (shares && shares > 0 && totalCost !== null && walletCurrency === currency ? totalCost / shares : null)
  const livePrice = getNumberValue(row, ["currentPrice", "price", "lastPrice", "marketPrice", "closePrice"])
    ?? (shares && shares > 0 && currentValue !== null && walletCurrency === currency ? currentValue / shares : null)
  const companyName = getStringValue(row, ["instrument.name", "name", "instrumentName", "displayName", "shortName"])
  const recentChange = getNumberValue(row, ["currentPriceChange", "priceChange", "todayChange", "recentChange"]) ?? 0
  const explicitTotalPlValue = getNumberValue(row, [
    "walletImpact.result",
    "walletImpact.totalProfit",
    "walletImpact.profit",
    "walletImpact.unrealizedProfit",
    "unrealizedProfit",
    "unrealisedProfit",
    "profit",
    "ppl",
  ])
  const explicitTotalPlPercentValue = getNumberValue(row, [
    "walletImpact.resultCoef",
    "walletImpact.profitPercentage",
    "profitPercentage",
    "pplPercent",
  ])

  if (!ticker || shares === null || averagePrice === null || livePrice === null || !currency || shares <= 0) {
    return null
  }

  const resolvedCompanyName = companyName ?? ticker
  const normalizedTicker = normalizeTickerSymbol(ticker)
  const rowPositionId = getNumberValue(row, ["positionId", "PositionId", "id", "Id"])
  const externalPositionId = rowPositionId !== null ? `position:${rowPositionId}` : `ticker:${normalizedTicker}`
  const nativeTotalValue = shares * livePrice
  const walletValueIsGbp = walletCurrency === "GBP" && currentValue !== null
  const fxRateToGbp = walletValueIsGbp && nativeTotalValue > 0
    ? Math.abs(currentValue) / nativeTotalValue
    : currency === "GBP"
      ? 1
      : undefined
  const explicitTotalPlGbp = explicitTotalPlValue === null
    ? undefined
    : walletCurrency === "GBP"
      ? explicitTotalPlValue
      : walletCurrency === currency
        ? explicitTotalPlValue * (fxRateToGbp ?? USD_TO_GBP_FALLBACK_RATE)
        : undefined

  const position = normalizeImportedHolding({
    broker: "t212",
    brokerLabel: "Trading 212",
    externalPositionId,
    ticker,
    companyName: resolvedCompanyName,
    shares,
    avgPrice: averagePrice,
    livePrice: livePrice ?? averagePrice,
    nativeCurrency: currency,
    assetType: normalizeTrading212AssetType(row, resolvedCompanyName),
    fxRateToGbp,
    totalPL: explicitTotalPlGbp,
    totalPLPercent: explicitTotalPlPercentValue === null
      ? undefined
      : Math.abs(explicitTotalPlPercentValue) <= 1
        ? explicitTotalPlPercentValue * 100
        : explicitTotalPlPercentValue,
    recentChange,
  })

  return {
    ...position,
    brokerInstrumentId: normalizedTicker,
  }
}

function normalizeTrading212Credentials(credentials?: string | BrokerApiCredentials) {
  if (!credentials) {
    return { apiKey: "", apiSecret: "" }
  }

  if (typeof credentials === "string") {
    return { apiKey: credentials.trim(), apiSecret: "" }
  }

  return {
    apiKey: credentials.apiKey.trim(),
    apiSecret: credentials.apiSecret?.trim() ?? "",
  }
}

function formatTrading212AuthHeader(apiKey: string, apiSecret: string) {
  const encodedCredentials = Buffer.from(`${apiKey}:${apiSecret}`, "utf8").toString("base64")
  return `Basic ${encodedCredentials}`
}

async function fetchTrading212Json<T>(path: string, apiKey: string, apiSecret: string): Promise<T> {
  const { body } = await fetchTrading212JsonWithHeaders<T>(path, apiKey, apiSecret)
  return body
}

async function fetchTrading212JsonWithHeaders<T>(path: string, apiKey: string, apiSecret: string): Promise<{ body: T; headers: Headers }> {
  const normalizedPath = normalizeTrading212Path(path)
  const requestUrl = /^https?:\/\//i.test(normalizedPath)
    ? normalizedPath
    : `${formatTrading212BaseUrl()}${normalizedPath}`

  const response = await fetch(requestUrl, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: formatTrading212AuthHeader(apiKey, apiSecret),
    },
  })

  if (!response.ok) {
    const responseText = await response.text()
    const detail = responseText.trim()
      ? ` Trading 212 responded with ${response.status}: ${responseText.trim().slice(0, 240)}`
      : ` Trading 212 responded with ${response.status}.`

    throw new Error(`Failed to load Trading 212 data from ${path}.${detail}`)
  }

  return { body: await response.json() as T, headers: response.headers }
}

async function postTrading212Json<T>(path: string, apiKey: string, apiSecret: string, body: unknown): Promise<T> {
  const normalizedPath = normalizeTrading212Path(path)
  const requestUrl = /^https?:\/\//i.test(normalizedPath)
    ? normalizedPath
    : `${formatTrading212BaseUrl()}${normalizedPath}`

  const response = await fetch(requestUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: formatTrading212AuthHeader(apiKey, apiSecret),
    },
    body: JSON.stringify(body),
  })

  const responseText = await response.text()
  const parsedBody = responseText.trim() ? JSON.parse(responseText) as T : ({} as T)

  if (!response.ok) {
    const detail = responseText.trim()
      ? ` Trading 212 responded with ${response.status}: ${responseText.trim().slice(0, 240)}`
      : ` Trading 212 responded with ${response.status}.`

    throw new Error(`Failed to place Trading 212 order.${detail}`)
  }

  return parsedBody
}

export function getTrading212OrderCapabilities(): OrderCapability {
  return {
    broker: "t212",
    supportedOrderTypes: ["market", "limit", "stop", "stop_limit"],
    supportsValueOrders: false,
    supportsStopLoss: false,
    supportsTakeProfit: false,
    supportsCancel: true,
  }
}

export function buildTrading212OrderPayload(order: TradeOrderRequest) {
  const ticker = order.instrumentId.trim() || order.ticker.trim()
  const signedQuantity = (order.quantity ?? 0) * (order.side === "buy" ? 1 : -1)
  const payload: Trading212OrderPayload = {
    ticker,
    quantity: signedQuantity,
  }

  if (order.orderType === "limit" || order.orderType === "stop_limit") {
    payload.limitPrice = order.limitPrice ?? 0
  }
  if (order.orderType === "stop" || order.orderType === "stop_limit") {
    payload.stopPrice = order.stopPrice ?? 0
  }
  if (order.timeValidity) {
    payload.timeValidity = order.timeValidity
  }

  const endpointByType: Record<TradeOrderRequest["orderType"], string> = {
    market: "/equity/orders/market",
    limit: "/equity/orders/limit",
    stop: "/equity/orders/stop",
    stop_limit: "/equity/orders/stop_limit",
  }

  return {
    endpoint: endpointByType[order.orderType],
    payload,
  }
}

export async function previewTrading212Order(order: TradeOrderRequest) {
  return buildOrderPreview(order)
}

export async function placeTrading212Order(order: TradeOrderRequest, credentials?: string | BrokerApiCredentials): Promise<BrokerOrderResult> {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)
  const { endpoint, payload } = buildTrading212OrderPayload(order)
  const rawResponse = await postTrading212Json<Trading212ApiRow>(endpoint, apiKey, apiSecret, payload)
  const brokerOrderId = getStringValue(rawResponse, ["orderId", "id", "requestId"]) ?? null
  const jsonResponse = JSON.parse(JSON.stringify(rawResponse)) as Json

  return {
    brokerOrderId,
    status: "submitted",
    rawResponse: jsonResponse,
  }
}

async function deleteTrading212Json<T>(path: string, apiKey: string, apiSecret: string): Promise<T> {
  const normalizedPath = normalizeTrading212Path(path)
  const requestUrl = /^https?:\/\//i.test(normalizedPath)
    ? normalizedPath
    : `${formatTrading212BaseUrl()}${normalizedPath}`

  const response = await fetch(requestUrl, {
    method: "DELETE",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: formatTrading212AuthHeader(apiKey, apiSecret),
    },
  })

  const responseText = await response.text()
  const parsedBody = responseText.trim() ? JSON.parse(responseText) as T : ({} as T)

  if (!response.ok) {
    const detail = responseText.trim()
      ? ` Trading 212 responded with ${response.status}: ${responseText.trim().slice(0, 240)}`
      : ` Trading 212 responded with ${response.status}.`

    throw new Error(`Failed to cancel Trading 212 order.${detail}`)
  }

  return parsedBody
}

function mapTrading212PendingOrderRow(row: Trading212ApiRow): PendingBrokerOrder | null {
  const brokerOrderId = getIdentifierValue(row, ["id", "orderId", "order.id"])
  const ticker = getStringValue(row, ["instrument.ticker", "ticker", "symbol", "instrumentCode"])
  const quantity = getNumberValue(row, ["quantity", "filledQuantity", "order.quantity"])
  const limitPrice = getNumberValue(row, ["limitPrice", "order.limitPrice"])
  const stopPrice = getNumberValue(row, ["stopPrice", "order.stopPrice"])
  const createdAt = getStringValue(row, ["createdAt", "order.createdAt", "timestamp"])
  const orderTypeRaw = getStringValue(row, ["type", "orderType", "order.type"])?.toLowerCase() ?? "unknown"
  const orderType = orderTypeRaw.includes("stop_limit") || orderTypeRaw.includes("stop limit")
    ? "stop_limit" as const
    : orderTypeRaw.includes("stop")
      ? "stop" as const
      : orderTypeRaw.includes("limit")
        ? "limit" as const
        : orderTypeRaw.includes("market")
          ? "market" as const
          : "unknown" as const

  if (!brokerOrderId || !ticker) {
    return null
  }

  const signedQuantity = quantity ?? 0

  return {
    broker: "t212",
    brokerLabel: "Trading 212",
    brokerOrderId,
    ticker: normalizeTickerSymbol(ticker),
    companyName: getStringValue(row, ["instrument.name", "name", "instrumentName"]) ?? ticker,
    side: signedQuantity < 0 ? "sell" : "buy",
    orderType,
    quantity: quantity === null ? null : Math.abs(quantity),
    limitPrice,
    stopPrice,
    createdAt,
    cancelKind: "generic",
  }
}

function mapTrading212DividendRowToActivity(row: Trading212ApiRow): PortfolioActivityEvent | null {
  const timestamp = getStringValue(row, ["paidOn", "date", "timestamp", "createdAt"])
  const amount = getNumberValue(row, ["amount", "grossAmount", "netAmount", "value"])
  const ticker = getStringValue(row, ["instrument.ticker", "ticker", "symbol"]) ?? "CASH"
  const currency = normalizeCurrency(getStringValue(row, ["currency", "instrument.currency"])) ?? getConfiguredTrading212AccountCurrency() ?? "GBP"

  if (!timestamp || amount === null) {
    return null
  }

  const grossAmountGbp = convertTrading212WalletAmountToGbp(amount, currency, currency, null, null)

  return {
    id: `t212:dividend:${timestamp}:${ticker}:${amount}`,
    timestamp,
    broker: "t212",
    brokerLabel: "Trading 212",
    ticker: normalizeTickerSymbol(ticker),
    companyName: getStringValue(row, ["instrument.name", "name"]) ?? ticker,
    type: "dividend",
    shares: 0,
    price: 0,
    nativeCurrency: currency,
    grossAmount: amount,
    grossAmountGbp,
    orderType: "Dividend",
  }
}

function mapTrading212TransactionRowToActivity(row: Trading212ApiRow): PortfolioActivityEvent | null {
  const timestamp = getStringValue(row, ["dateTime", "timestamp", "createdAt", "date"])
  const amount = getNumberValue(row, ["amount", "value", "netAmount"])
  const currency = normalizeCurrency(getStringValue(row, ["currency"])) ?? getConfiguredTrading212AccountCurrency() ?? "GBP"
  const typeRaw = getStringValue(row, ["type", "transactionType", "reference"])?.toLowerCase() ?? ""

  if (!timestamp || amount === null) {
    return null
  }

  const activityType = typeRaw.includes("withdraw")
    ? "withdrawal" as const
    : typeRaw.includes("deposit") || typeRaw.includes("top up") || typeRaw.includes("topup")
      ? "deposit" as const
      : typeRaw.includes("fee") || typeRaw.includes("charge")
        ? "fee" as const
        : typeRaw.includes("fx") || typeRaw.includes("currency")
          ? "fx" as const
          : amount >= 0
            ? "deposit" as const
            : "withdrawal" as const

  const grossAmountGbp = convertTrading212WalletAmountToGbp(Math.abs(amount), currency, currency, null, null)

  return {
    id: `t212:txn:${timestamp}:${typeRaw}:${amount}`,
    timestamp,
    broker: "t212",
    brokerLabel: "Trading 212",
    ticker: "CASH",
    companyName: typeRaw || "Cash movement",
    type: activityType,
    shares: 0,
    price: 0,
    nativeCurrency: currency,
    grossAmount: Math.abs(amount),
    grossAmountGbp,
    orderType: typeRaw || "Transaction",
  }
}

export async function fetchTrading212PendingOrdersFromApi(credentials?: string | BrokerApiCredentials): Promise<PendingBrokerOrder[]> {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)

  if (!apiKey || !apiSecret) {
    return []
  }

  const payload = await fetchTrading212Json<Trading212ApiResponse>("/equity/orders", apiKey, apiSecret)
  return extractTrading212Rows(payload)
    .map(mapTrading212PendingOrderRow)
    .filter((order): order is PendingBrokerOrder => Boolean(order))
}

export async function cancelTrading212Order(
  brokerOrderId: string,
  credentials?: string | BrokerApiCredentials,
  _options?: { cancelKind?: PendingOrderCancelKind }
): Promise<BrokerOrderResult> {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)
  const rawResponse = await deleteTrading212Json<Trading212ApiRow>(`/equity/orders/${encodeURIComponent(brokerOrderId)}`, apiKey, apiSecret)
  const jsonResponse = JSON.parse(JSON.stringify(rawResponse)) as Json

  return {
    brokerOrderId,
    status: "accepted",
    rawResponse: jsonResponse,
  }
}

async function fetchTrading212PaginatedHistory(
  initialPath: string,
  apiKey: string,
  apiSecret: string,
  maxPages = 3
) {
  const items: Trading212ApiRow[] = []
  let nextPath: string | null = initialPath
  let pagesLoaded = 0

  while (nextPath && pagesLoaded < maxPages) {
    const historyPayload: Trading212HistoryResponse = await fetchTrading212Json(nextPath, apiKey, apiSecret)
    pagesLoaded += 1
    items.push(...(historyPayload.items ?? []).filter(isRecord))
    nextPath = typeof historyPayload.nextPagePath === "string" && historyPayload.nextPagePath.trim()
      ? historyPayload.nextPagePath
      : null

    if (nextPath && pagesLoaded < maxPages) {
      await new Promise((resolve) => setTimeout(resolve, TRADING212_HISTORY_PAGE_DELAY_MS))
    }
  }

  return items
}

export async function fetchTrading212CashActivityFromApi(credentials?: string | BrokerApiCredentials): Promise<PortfolioActivityEvent[]> {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)

  if (!apiKey || !apiSecret) {
    return []
  }

  const [dividendRows, transactionRows] = await Promise.all([
    fetchTrading212PaginatedHistory("/equity/history/dividends?limit=50", apiKey, apiSecret, 2).catch(() => []),
    fetchTrading212PaginatedHistory("/equity/history/transactions?limit=50", apiKey, apiSecret, 2).catch(() => []),
  ])

  return [
    ...dividendRows.map(mapTrading212DividendRowToActivity).filter((event): event is PortfolioActivityEvent => Boolean(event)),
    ...transactionRows.map(mapTrading212TransactionRowToActivity).filter((event): event is PortfolioActivityEvent => Boolean(event)),
  ]
}

function normalizeTrading212ActivityType(row: Trading212ApiRow, quantity: number) {
  const explicitType = getStringValue(row, ["order.side", "side", "type", "order.type", "orderType"])?.toLowerCase()

  if (explicitType?.includes("sell")) {
    return "sell" as const
  }

  if (explicitType?.includes("buy")) {
    return "buy" as const
  }

  return quantity < 0 ? "sell" as const : "buy" as const
}

function isUnfilledTrading212OrderRow(row: Trading212ApiRow) {
  const status = getStringValue(row, ["order.status", "status"])?.toUpperCase()
  if (status === "CANCELLED" || status === "REJECTED" || status === "EXPIRED") {
    return true
  }

  const fillQuantity = getNumberValue(row, ["fill.quantity"])
  const filledQuantity = getNumberValue(row, ["order.filledQuantity", "filledQuantity"])
  const legacyQuantity = getNumberValue(row, ["quantity", "qty"])

  if (fillQuantity !== null && Math.abs(fillQuantity) > 0) {
    return false
  }

  if (filledQuantity !== null && Math.abs(filledQuantity) > 0) {
    return false
  }

  if (legacyQuantity !== null && Math.abs(legacyQuantity) > 0) {
    const hasExecutionTimestamp = Boolean(getStringValue(row, [
      "fill.filledAt",
      "fill.executedAt",
      "filledOn",
      "executedOn",
      "executedAt",
      "dateExecuted",
    ]))
    if (hasExecutionTimestamp) {
      return false
    }
  }

  return true
}

function mapTrading212OrderRowToActivity(row: Trading212ApiRow, liveUsdToGbp = USD_TO_GBP_FALLBACK_RATE): PortfolioActivityEvent | null {
  if (isUnfilledTrading212OrderRow(row)) {
    return null
  }

  // T212 API returns nested { order: {...}, fill: {...} } structure
  const timestamp = getStringValue(row, [
    "fill.filledAt",
    "fill.executedAt",
    "order.createdAt",
    "filledOn",
    "executedOn",
    "executedAt",
    "dateExecuted",
    "updatedAt",
    "createdAt",
    "timestamp",
  ])
  const rawQuantity = getNumberValue(row, [
    "fill.quantity",
    "order.filledQuantity",
    "quantity",
    "filledQuantity",
    "qty",
  ])
  const quantity = rawQuantity === null ? null : Math.abs(rawQuantity)
  const price = getNumberValue(row, [
    "fill.price",
    "fillPrice",
    "filledPrice",
    "averagePrice",
    "price",
  ])
  const ticker = getStringValue(row, [
    "order.instrument.ticker",
    "order.ticker",
    "instrument.ticker",
    "ticker",
    "symbol",
    "instrumentCode",
  ])
  const companyName = getStringValue(row, [
    "order.instrument.name",
    "instrument.name",
    "name",
    "instrumentName",
    "displayName",
  ]) ?? ticker
  // instrument.currency is the native currency of the stock (e.g., USD)
  // walletImpact.currency is the account currency (e.g., GBP)
  const instrumentCurrency = normalizeCurrency(getStringValue(row, [
    "order.instrument.currency",
    "instrument.currency",
    "order.currency",
    "currencyCode",
    "currency",
  ]))
  // walletImpact.netValue is already in account currency (GBP for UK accounts)
  const walletNetValue = getNumberValue(row, [
    "fill.walletImpact.netValue",
    "walletImpact.netValue",
  ])
  const walletCurrency = normalizeCurrency(getStringValue(row, [
    "fill.walletImpact.currency",
    "walletImpact.currency",
  ]))
  const resolvedWalletCurrency = walletCurrency ?? getConfiguredTrading212AccountCurrency() ?? "GBP"
  const fxRate = getNumberValue(row, [
    "fill.walletImpact.fxRate",
    "walletImpact.fxRate",
  ])
  const nativeNotional = quantity !== null && price !== null ? quantity * price : null

  const grossAmountGbp = walletNetValue !== null
    ? convertTrading212WalletAmountToGbp(
      Math.abs(walletNetValue),
      resolvedWalletCurrency,
      instrumentCurrency,
      fxRate,
      nativeNotional,
      liveUsdToGbp
    )
    : (quantity !== null && price !== null
      ? (instrumentCurrency === "GBP"
        ? quantity * price
        : fxRate && fxRate > 0
          ? (quantity * price) / fxRate
          : (quantity * price) * liveUsdToGbp)
      : null)

  const grossAmountNative = quantity !== null && price !== null ? quantity * price : null

  if (!timestamp || quantity === null || price === null || grossAmountGbp === null || !ticker || quantity <= 0 || price <= 0) {
    return null
  }

  const nativeCurrency = instrumentCurrency ?? resolvedWalletCurrency
  const fillId = getIdentifierValue(row, ["fill.id", "fillId"])
  const orderId = getIdentifierValue(row, ["order.id", "orderId", "id"])
  const activityType = normalizeTrading212ActivityType(row, rawQuantity ?? quantity)
  const realisedPL = getNumberValue(row, [
    "fill.walletImpact.realisedProfitLoss",
    "fill.walletImpact.realizedProfitLoss",
    "fill.walletImpact.result",
    "fill.walletImpact.profit",
    "walletImpact.realisedProfitLoss",
    "walletImpact.realizedProfitLoss",
    "walletImpact.result",
    "walletImpact.profit",
  ])
  const realisedProfitGbp = activityType === "sell" && realisedPL !== null
    ? convertTrading212WalletAmountToGbp(
      realisedPL,
      resolvedWalletCurrency,
      instrumentCurrency,
      fxRate,
      nativeNotional,
      liveUsdToGbp
    )
    : undefined
  const activityId = fillId
    ? `t212:fill:${fillId}`
    : orderId
      ? `t212:order:${orderId}:${timestamp}`
      : `t212:${normalizeTickerSymbol(ticker)}:${timestamp}`

  return {
    id: activityId,
    timestamp,
    broker: "t212",
    brokerLabel: "Trading 212",
    ticker: normalizeTickerSymbol(ticker),
    companyName: companyName ?? ticker,
    type: activityType,
    shares: quantity,
    price,
    nativeCurrency,
    grossAmount: grossAmountNative ?? grossAmountGbp,
    grossAmountGbp,
    realisedProfitGbp,
    orderType: getStringValue(row, ["order.type", "type", "orderType"]) ?? undefined,
  }
}

export function mapTrading212HistoryItemsToActivity(items: Trading212ApiRow[], liveUsdToGbp = USD_TO_GBP_FALLBACK_RATE): PortfolioActivityEvent[] {
  return items
    .map((row) => mapTrading212OrderRowToActivity(row, liveUsdToGbp))
    .filter((event): event is PortfolioActivityEvent => Boolean(event))
}

export function mapTrading212PortfolioResponse(payload: unknown): PortfolioPosition[] {
  const rows = extractTrading212Rows(payload)
  const positions = rows
    .map(mapTrading212RowToPosition)
    .filter((position): position is PortfolioPosition => Boolean(position))

  if (rows.length > 0 && positions.length === 0) {
    throw new Error(
      "Trading 212 responded successfully, but none of the returned positions matched the position fields this browser-mode importer currently supports. If your account uses a non-GBP/USD wallet currency or Trading 212 changed its payload shape again, the mapper needs another update."
    )
  }

  return positions
}

export async function fetchTrading212PortfolioFromApi(credentials?: string | BrokerApiCredentials, _liveUsdToGbp?: number): Promise<PortfolioPosition[]> {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("Trading 212 requires both an API key and an API secret. Paste both values before syncing.")
  }

  logger.info({ broker: "t212" }, "Starting Trading 212 portfolio sync")
  const payload = await fetchTrading212Json<Trading212ApiResponse>("/equity/positions", apiKey, apiSecret)
  return mapTrading212PortfolioResponse(payload)
}

export function mapTrading212AccountSummary(payload: unknown): import("@/types/broker-account").BrokerAccountSnapshot | null {
  if (!isRecord(payload)) {
    return null
  }

  const cash = isRecord(payload.cash) ? payload.cash : null
  const investments = isRecord(payload.investments) ? payload.investments : null
  const currency = normalizeCurrency(getStringValue(payload, ["currency"])) ?? "GBP"

  return {
    broker: "t212",
    currency,
    availableCash: cash ? getNumberValue(cash, ["availableToTrade"]) : null,
    investedAmount: investments ? getNumberValue(investments, ["totalCost"]) : null,
    totalEquity: getNumberValue(payload, ["totalValue"]),
    holdingsValue: investments ? getNumberValue(investments, ["currentValue"]) : null,
    unrealizedPl: investments ? getNumberValue(investments, ["unrealizedProfitLoss"]) : null,
    realizedPl: investments ? getNumberValue(investments, ["realizedProfitLoss"]) : null,
  }
}

export async function fetchTrading212AccountSummaryFromApi(credentials?: string | BrokerApiCredentials, _liveUsdToGbp?: number) {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)

  if (!apiKey || !apiSecret) {
    return null
  }

  const payload = await fetchTrading212Json<Trading212ApiResponse>("/equity/account/summary", apiKey, apiSecret)
  return mapTrading212AccountSummary(payload)
}

export async function fetchTrading212SyncDataFromApi(credentials?: string | BrokerApiCredentials) {
  const liveUsdToGbp = await getUsdToGbpRate()
  logger.info({ broker: "t212", liveUsdToGbp }, "Fetched live USD→GBP rate for sync")
  const positions = await fetchTrading212PortfolioFromApi(credentials, liveUsdToGbp)
  const [tradeActivity, cashActivity] = await Promise.all([
    fetchTrading212ActivityFromApi(credentials, liveUsdToGbp),
    fetchTrading212CashActivityFromApi(credentials).catch((error) => {
      logger.warn({ broker: "t212", error: getErrorLogDetails(error) }, "Trading 212 cash activity sync skipped")
      return [] as PortfolioActivityEvent[]
    }),
  ])
  const activity = [...tradeActivity, ...cashActivity]
  const accountSnapshot = await fetchTrading212AccountSummaryFromApi(credentials, liveUsdToGbp)

  return {
    positions,
    activity,
    accountSnapshot,
    syncStats: {
      positionsMapped: positions.length,
      positionsStored: positions.length,
      activityImported: activity.length,
    },
  }
}

export async function searchTrading212InstrumentsFromApi(
  query: string,
  credentials?: string | BrokerApiCredentials
): Promise<BrokerInstrument[]> {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("Trading 212 requires both an API key and an API secret before searching instruments.")
  }

  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery.length < 2) {
    return []
  }

  const payload = await fetchTrading212Json<Trading212InstrumentResponse>("/equity/metadata/instruments", apiKey, apiSecret)

  return payload
    .filter(isRecord)
    .map(mapTrading212InstrumentRow)
    .filter((instrument): instrument is BrokerInstrument => Boolean(instrument))
    .filter((instrument) => {
      const haystack = `${instrument.ticker} ${instrument.id} ${instrument.companyName}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
    .slice(0, 12)
}

export async function fetchTrading212ActivityFromApi(credentials?: string | BrokerApiCredentials, liveUsdToGbp = USD_TO_GBP_FALLBACK_RATE): Promise<PortfolioActivityEvent[]> {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("Trading 212 requires both an API key and an API secret before syncing history.")
  }

  const items: Trading212ApiRow[] = []
  let nextPath: string | null = DEFAULT_TRADING212_HISTORY_PATH
  const maxPages = Number(process.env.TRADING212_HISTORY_MAX_PAGES ?? DEFAULT_TRADING212_HISTORY_MAX_PAGES)
  const pageLimit = Number.isFinite(maxPages) && maxPages > 0 ? Math.floor(maxPages) : DEFAULT_TRADING212_HISTORY_MAX_PAGES
  let pagesLoaded = 0

  logger.info({ broker: "t212", path: DEFAULT_TRADING212_HISTORY_PATH }, "Starting Trading 212 history sync")

  try {
    while (nextPath && pagesLoaded < pageLimit) {
      const historyResult = await fetchTrading212JsonWithHeaders<Trading212HistoryResponse>(nextPath, apiKey, apiSecret)
      const historyPayload: Trading212HistoryResponse = historyResult.body
      const responseHeaders: Headers = historyResult.headers
      pagesLoaded += 1
      const pageItems = (historyPayload.items ?? []).filter(isRecord)
      items.push(...pageItems)
      nextPath = typeof historyPayload.nextPagePath === "string" && historyPayload.nextPagePath.trim()
        ? historyPayload.nextPagePath
        : null

      const remaining = Number(responseHeaders.get("x-ratelimit-remaining") ?? NaN)
      const resetAt = Number(responseHeaders.get("x-ratelimit-reset") ?? NaN)
      logger.debug({ broker: "t212", pageItems: pageItems.length, nextPath, totalItems: items.length, pagesLoaded, pageLimit, rateLimitRemaining: remaining }, "Loaded Trading 212 history page")

      if (nextPath && pagesLoaded < pageLimit) {
        if (Number.isFinite(remaining) && remaining <= 1 && Number.isFinite(resetAt)) {
          const waitMs = Math.max(0, resetAt * 1000 - Date.now()) + 500
          logger.info({ broker: "t212", waitMs, resetAt }, "T212 rate-limit exhausted, waiting for reset")
          await new Promise((resolve) => setTimeout(resolve, waitMs))
        } else {
          await new Promise((resolve) => setTimeout(resolve, TRADING212_HISTORY_PAGE_DELAY_MS))
        }
      }
    }

    if (nextPath) {
      logger.info({ broker: "t212", pagesLoaded, pageLimit, totalItems: items.length }, "Stopped Trading 212 history pagination at configured page limit")
    }
  } catch (error) {
    if (items.length > 0) {
      logger.warn({ broker: "t212", error: getErrorLogDetails(error), pagesLoaded, totalItems: items.length }, "Trading 212 history pagination stopped after partial results")
    } else {
      logger.error({ broker: "t212", error: getErrorLogDetails(error) }, "Trading 212 history sync failed")
      throw error
    }
  }

  const activity = mapTrading212HistoryItemsToActivity(items, liveUsdToGbp)

  logger.info({ broker: "t212", historyRows: items.length, activityEvents: activity.length }, "Mapped Trading 212 history into activity events")

  return activity
}

