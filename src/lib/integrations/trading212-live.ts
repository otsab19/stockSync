import { inferAssetType, normalizeImportedHolding, normalizeTickerSymbol } from "@/lib/portfolio/position-normalizer"
import { logger, getErrorLogDetails } from "@/lib/backend/logger"
import { buildOrderPreview } from "@/lib/orders/validation"
import type { BrokerInstrument } from "@/lib/integrations/provider"
import type { BrokerApiCredentials } from "@/types/integrations"
import type { BrokerOrderResult, OrderCapability, TradeOrderRequest } from "@/types/orders"
import type { AssetType, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"
import type { Json } from "@/types/supabase"

const DEFAULT_TRADING212_API_BASE_URL = "https://live.trading212.com/api/v0"
const DEFAULT_TRADING212_HISTORY_PATH = "/equity/history/orders?limit=50"
const USD_TO_GBP_FALLBACK_RATE = 0.79
const TRADING212_HISTORY_PAGE_DELAY_MS = 11_000 // 6 req/min limit — keep safely below one request every 10s
const DEFAULT_TRADING212_HISTORY_MAX_PAGES = 2

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

  return normalizeImportedHolding({
    broker: "t212",
    brokerLabel: "Trading 212",
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

  return await response.json() as T
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
    supportsCancel: false,
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

function normalizeTrading212ActivityType(row: Trading212ApiRow, quantity: number) {
  const explicitType = getStringValue(row, ["order.side", "side", "type", "order.type", "orderType", "status"])?.toLowerCase()

  if (explicitType?.includes("sell")) {
    return "sell" as const
  }

  if (explicitType?.includes("buy")) {
    return "buy" as const
  }

  return quantity < 0 ? "sell" as const : "buy" as const
}

function mapTrading212OrderRowToActivity(row: Trading212ApiRow): PortfolioActivityEvent | null {
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
    "order.quantity",
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
    "order.limitPrice",
    "limitPrice",
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
  const fxRate = getNumberValue(row, [
    "fill.walletImpact.fxRate",
    "walletImpact.fxRate",
  ])

  // Derive grossAmount: prefer walletImpact.netValue (already in GBP)
  // Otherwise fall back to quantity * price (in instrument currency)
  const grossAmountGbp = walletNetValue !== null
    ? Math.abs(walletNetValue)
    : (quantity !== null && price !== null
      ? (instrumentCurrency === "GBP"
        ? quantity * price
        : fxRate
          ? (quantity * price) / fxRate
          : (quantity * price) * USD_TO_GBP_FALLBACK_RATE)
      : null)

  const grossAmountNative = quantity !== null && price !== null ? quantity * price : null

  if (!timestamp || quantity === null || price === null || grossAmountGbp === null || !ticker || quantity <= 0 || price <= 0) {
    return null
  }

  const nativeCurrency = instrumentCurrency ?? walletCurrency ?? "GBP"
  const orderId = getStringValue(row, ["order.id", "fill.id", "id", "orderId"])
  const realisedPL = getNumberValue(row, [
    "fill.walletImpact.realisedProfitLoss",
    "fill.walletImpact.realizedProfitLoss",
    "fill.walletImpact.realisedProfit",
    "fill.walletImpact.realizedProfit",
    "walletImpact.realisedProfitLoss",
    "walletImpact.realizedProfitLoss",
    "walletImpact.realisedProfit",
    "walletImpact.realizedProfit",
    "realisedProfitLoss",
    "realizedProfitLoss",
    "realisedProfit",
    "realizedProfit",
  ])

  return {
    id: `t212:${orderId ?? `${ticker}:${timestamp}`}`,
    timestamp,
    broker: "t212",
    brokerLabel: "Trading 212",
    ticker: normalizeTickerSymbol(ticker),
    companyName: companyName ?? ticker,
    type: normalizeTrading212ActivityType(row, rawQuantity ?? quantity),
    shares: quantity,
    price,
    nativeCurrency,
    grossAmount: grossAmountNative ?? grossAmountGbp,
    grossAmountGbp,
    realisedProfitGbp: realisedPL ?? undefined,
    orderType: getStringValue(row, ["order.type", "type", "orderType"]) ?? undefined,
  }
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

export async function fetchTrading212PortfolioFromApi(credentials?: string | BrokerApiCredentials): Promise<PortfolioPosition[]> {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("Trading 212 requires both an API key and an API secret. Paste both values before syncing.")
  }

  logger.info({ broker: "t212" }, "Starting Trading 212 portfolio sync")
  const payload = await fetchTrading212Json<Trading212ApiResponse>("/equity/positions", apiKey, apiSecret)
  return mapTrading212PortfolioResponse(payload)
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

export async function fetchTrading212ActivityFromApi(credentials?: string | BrokerApiCredentials): Promise<PortfolioActivityEvent[]> {
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
      const historyPayload: Trading212HistoryResponse = await fetchTrading212Json(nextPath, apiKey, apiSecret)
      pagesLoaded += 1
      const pageItems = (historyPayload.items ?? []).filter(isRecord)
      items.push(...pageItems)
      nextPath = typeof historyPayload.nextPagePath === "string" && historyPayload.nextPagePath.trim()
        ? historyPayload.nextPagePath
        : null
      logger.debug({ broker: "t212", pageItems: pageItems.length, nextPath, totalItems: items.length, pagesLoaded, pageLimit }, "Loaded Trading 212 history page")

      // Rate limit: 6 req / 1 min — wait between pages to avoid 429
      if (nextPath && pagesLoaded < pageLimit) {
        await new Promise((resolve) => setTimeout(resolve, TRADING212_HISTORY_PAGE_DELAY_MS))
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

  const activity = items
    .map(mapTrading212OrderRowToActivity)
    .filter((event): event is PortfolioActivityEvent => Boolean(event))

  logger.info({ broker: "t212", historyRows: items.length, activityEvents: activity.length }, "Mapped Trading 212 history into activity events")

  return activity
}

