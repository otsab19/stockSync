import { inferAssetType, normalizeImportedHolding } from "@/lib/portfolio/position-normalizer"
import { logger, getErrorLogDetails } from "@/lib/backend/logger"
import type { BrokerApiCredentials } from "@/types/integrations"
import type { AssetType, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"

const DEFAULT_TRADING212_API_BASE_URL = "https://live.trading212.com/api/v0"
const DEFAULT_TRADING212_HISTORY_PATH = "/equity/history/orders?limit=50"
const USD_TO_GBP_FALLBACK_RATE = 0.79
const TRADING212_HISTORY_PAGE_DELAY_MS = 6_000 // 6 req/min limit — wait 6s between pages

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
  const totalCost = getNumberValue(row, ["walletImpact.totalCost"])
  const currentValue = getNumberValue(row, ["walletImpact.currentValue"])
  const averagePrice = getNumberValue(row, ["averagePricePaid", "averagePrice", "avgPrice", "priceAvg", "weightedAveragePrice"])
    ?? (shares && shares > 0 && totalCost !== null ? totalCost / shares : null)
  const livePrice = getNumberValue(row, ["currentPrice", "price", "lastPrice", "marketPrice", "closePrice"])
    ?? (shares && shares > 0 && currentValue !== null ? currentValue / shares : null)
  const companyName = getStringValue(row, ["instrument.name", "name", "instrumentName", "displayName", "shortName"])
  const currency = normalizeCurrency(getStringValue(row, ["walletImpact.currency", "currencyCode", "currency", "instrument.currency", "instrumentCurrency", "instrumentCurrencyCode"]))
  const recentChange = getNumberValue(row, ["currentPriceChange", "priceChange", "todayChange", "recentChange"]) ?? 0

  if (!ticker || shares === null || averagePrice === null || livePrice === null || !currency || shares <= 0) {
    return null
  }

  const resolvedCompanyName = companyName ?? ticker
  const cleanTicker = ticker.replace(/_US_EQ$|_EQ$|_GB_EQ$|p_EQ$/i, "").replace(/\.(L|LSE|LON)$/i, "")

  return normalizeImportedHolding({
    broker: "t212",
    brokerLabel: "Trading 212",
    ticker: cleanTicker,
    companyName: resolvedCompanyName,
    shares,
    avgPrice: averagePrice,
    livePrice: livePrice ?? averagePrice,
    nativeCurrency: currency,
    assetType: normalizeTrading212AssetType(row, resolvedCompanyName),
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
    "walletImpact.realisedProfitLoss",
    "realisedProfitLoss",
    "realizedProfitLoss",
  ])

  return {
    id: `t212:${orderId ?? `${ticker}:${timestamp}`}`,
    timestamp,
    broker: "t212",
    brokerLabel: "Trading 212",
    ticker: ticker.replace(/_US_EQ$|_EQ$|_GB_EQ$|p_EQ$/i, "").replace(/\.(L|LSE|LON)$/i, ""),
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

export async function fetchTrading212ActivityFromApi(credentials?: string | BrokerApiCredentials): Promise<PortfolioActivityEvent[]> {
  const { apiKey, apiSecret } = normalizeTrading212Credentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("Trading 212 requires both an API key and an API secret before syncing history.")
  }

  const items: Trading212ApiRow[] = []
  let nextPath: string | null = DEFAULT_TRADING212_HISTORY_PATH

  logger.info({ broker: "t212", path: DEFAULT_TRADING212_HISTORY_PATH }, "Starting Trading 212 history sync")

  try {
    while (nextPath) {
      const historyPayload: Trading212HistoryResponse = await fetchTrading212Json(nextPath, apiKey, apiSecret)
      const pageItems = (historyPayload.items ?? []).filter(isRecord)
      items.push(...pageItems)
      nextPath = typeof historyPayload.nextPagePath === "string" && historyPayload.nextPagePath.trim()
        ? historyPayload.nextPagePath
        : null
      logger.debug({ broker: "t212", pageItems: pageItems.length, nextPath, totalItems: items.length }, "Loaded Trading 212 history page")

      // Rate limit: 6 req / 1 min — wait between pages to avoid 429
      if (nextPath) {
        await new Promise((resolve) => setTimeout(resolve, TRADING212_HISTORY_PAGE_DELAY_MS))
      }
    }
  } catch (error) {
    logger.error({ broker: "t212", error: getErrorLogDetails(error) }, "Trading 212 history sync failed")
    throw error
  }

  const activity = items
    .map(mapTrading212OrderRowToActivity)
    .filter((event): event is PortfolioActivityEvent => Boolean(event))

  logger.info({ broker: "t212", historyRows: items.length, activityEvents: activity.length }, "Mapped Trading 212 history into activity events")

  return activity
}

