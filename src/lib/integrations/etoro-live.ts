import { inferAssetType, normalizeImportedHolding } from "@/lib/portfolio/position-normalizer"
import { logger, getErrorLogDetails } from "@/lib/backend/logger"
import type { BrokerApiCredentials } from "@/types/integrations"
import type { AssetType, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"

const DEFAULT_ETORO_API_BASE_URL = "https://public-api.etoro.com"
const DEFAULT_ETORO_REAL_PORTFOLIO_PATH = "/api/v1/trading/info/portfolio"
const DEFAULT_ETORO_REAL_PNL_PATH = "/api/v1/trading/info/real/pnl"
const DEFAULT_ETORO_DEMO_PORTFOLIO_PATH = "/api/v1/trading/info/demo/portfolio"
const DEFAULT_ETORO_DEMO_PNL_PATH = "/api/v1/trading/info/demo/pnl"
const DEFAULT_ETORO_TRADE_HISTORY_PATH = "/api/v1/trading/info/trade/history"
const USD_TO_GBP_FALLBACK_RATE = 0.79

type EtoroApiRow = Record<string, unknown>
type EtoroInstrumentMetadata = {
  instrumentId: number
  ticker: string | null
  companyName: string | null
  currency: PortfolioPosition["nativeCurrency"] | null
  priceScale: "standard" | "gbx"
  assetType: AssetType | null
}

type EtoroRateSnapshot = {
  instrumentId: number
  livePrice: number | null
  recentChange: number
}

type EtoroTradeHistoryRow = {
  instrumentId?: number
  InstrumentId?: number
  positionId?: number
  PositionId?: number
  openTimestamp?: string
  OpenTimestamp?: string
  closeTimestamp?: string
  CloseTimestamp?: string
  openRate?: number
  OpenRate?: number
  closeRate?: number
  CloseRate?: number
  amount?: number
  Amount?: number
  leverage?: number
  Leverage?: number
  isBuy?: boolean
  IsBuy?: boolean
  units?: number
  Units?: number
  amountInUnits?: number
  AmountInUnits?: number
  openUnits?: number
  OpenUnits?: number
  closeUnits?: number
  CloseUnits?: number
  closedUnits?: number
  ClosedUnits?: number
  unitsToDeduct?: number
  UnitsToDeduct?: number
  closeAmount?: number
  CloseAmount?: number
  closedAmount?: number
  ClosedAmount?: number
  openAmount?: number
  OpenAmount?: number
}

type EtoroActivityPhase = "open" | "close"

const ETORO_POSITION_CONTAINER_KEYS = [
  "positions",
  "Positions",
  "openPositions",
  "OpenPositions",
  "aggregatedPositions",
  "AggregatedPositions",
  "portfolioPositions",
  "PortfolioPositions",
  "tradePositions",
  "TradePositions",
  "socialTrades",
  "SocialTrades",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getNestedValue(row: EtoroApiRow, path: string) {
  return path
    .split(".")
    .reduce<unknown>((currentValue, segment) => (isRecord(currentValue) ? currentValue[segment] : undefined), row)
}

function getStringValue(row: EtoroApiRow, keys: string[]) {
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

function getBooleanValue(row: EtoroApiRow, keys: string[]) {
  for (const key of keys) {
    const value = key.includes(".") ? getNestedValue(row, key) : row[key]

    if (typeof value === "boolean") {
      return value
    }

    if (typeof value === "number") {
      if (value === 1) return true
      if (value === 0) return false
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase()

      if (["true", "1", "yes", "buy", "long"].includes(normalized)) {
        return true
      }

      if (["false", "0", "no", "sell", "short"].includes(normalized)) {
        return false
      }
    }
  }

  return null
}

function hasAnyValue(row: EtoroApiRow, keys: string[]) {
  return keys.some((key) => {
    const value = key.includes(".") ? getNestedValue(row, key) : row[key]

    if (typeof value === "number") {
      return Number.isFinite(value)
    }

    return typeof value === "string" && value.trim().length > 0
  })
}

function getNumberValue(row: EtoroApiRow, keys: string[]) {
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

function getEtoroCurrencyInfo(value: string | null): {
  currency: PortfolioPosition["nativeCurrency"] | null
  priceScale: EtoroInstrumentMetadata["priceScale"]
} {
  if (!value) {
    return {
      currency: null as PortfolioPosition["nativeCurrency"] | null,
      priceScale: "standard" as const,
    }
  }

  const trimmed = value.trim()
  const normalized = trimmed.toUpperCase()

  if (trimmed === "GBp" || normalized === "GBX") {
    return {
      currency: "GBP" as const,
      priceScale: "gbx" as const,
    }
  }

  if (normalized === "GBP" || normalized === "USD") {
    return {
      currency: normalized as PortfolioPosition["nativeCurrency"],
      priceScale: "standard" as const,
    }
  }

  return {
    currency: null as PortfolioPosition["nativeCurrency"] | null,
    priceScale: "standard" as const,
  }
}

function normalizeCurrency(value: string | null): PortfolioPosition["nativeCurrency"] | null {
  return getEtoroCurrencyInfo(value).currency
}

function normalizeEtoroPrice(value: number, priceScale: EtoroInstrumentMetadata["priceScale"]) {
  return priceScale === "gbx" ? value / 100 : value
}

function normalizeEtoroAssetType(row: EtoroApiRow, companyName: string): AssetType {
  const explicitType = getStringValue(row, [
    "assetClass",
    "assetType",
    "instrument.assetClass",
    "instrument.assetType",
    "instrument.category",
    "category",
    "type",
  ])

  if (!explicitType) {
    return inferAssetType(companyName)
  }

  return inferAssetType(explicitType, inferAssetType(companyName))
}

function getEtoroInstrumentId(row: EtoroApiRow) {
  return getNumberValue(row, ["instrumentID", "instrumentId", "InstrumentID", "InstrumentId", "instrument.id", "instrument.instrumentID"])
}

function mapMetadataAssetType(row: EtoroApiRow, companyName: string): AssetType | null {
  const explicitType = getStringValue(row, [
    "instrumentType",
    "InstrumentType",
    "instrumentTypeName",
    "InstrumentTypeName",
    "assetClass",
    "AssetClass",
    "assetType",
    "AssetType",
    "category",
    "Category",
  ])

  return explicitType ? inferAssetType(explicitType, inferAssetType(companyName)) : null
}

function mapInstrumentMetadataRow(row: EtoroApiRow): EtoroInstrumentMetadata | null {
  const instrumentId = getEtoroInstrumentId(row)

  if (instrumentId === null) {
    return null
  }

  const ticker = getStringValue(row, [
    "ticker",
    "Ticker",
    "symbol",
    "Symbol",
    "displaySymbol",
    "DisplaySymbol",
    "shortName",
    "ShortName",
    "displayname",
    "Displayname",
    "instrument.ticker",
    "instrument.symbol",
  ])
  const companyName = getStringValue(row, [
    "displayName",
    "DisplayName",
    "displayname",
    "Displayname",
    "name",
    "Name",
    "instrumentDisplayName",
    "InstrumentDisplayName",
    "instrumentName",
    "InstrumentName",
    "companyName",
    "CompanyName",
    "shortName",
    "ShortName",
    "instrument.name",
  ])
  const resolvedName = companyName ?? ticker ?? `Instrument ${instrumentId}`
  const resolvedTicker = ticker ?? (companyName && !companyName.includes(" ") ? companyName : null)

  const currencyInfo = getEtoroCurrencyInfo(getStringValue(row, [
    "currencyCode",
    "CurrencyCode",
    "currency",
    "Currency",
    "tradingCurrency",
    "TradingCurrency",
    "priceCurrency",
    "PriceCurrency",
    "instrumentCurrency",
    "InstrumentCurrency",
    "priceUnitCurrency",
    "PriceUnitCurrency",
    "quoteCurrency",
    "QuoteCurrency",
  ]))

  // Heuristic: detect LSE/GBX instruments from exchange info or symbol suffix
  const exchangeId = getNumberValue(row, ["exchangeID", "ExchangeID", "exchangeId", "ExchangeId"])
  const symbolFull = getStringValue(row, [
    "symbolFull", "SymbolFull", "fullSymbol", "FullSymbol",
    "ticker", "Ticker", "symbol", "Symbol",
    "isin", "ISIN", "Isin",
  ])
  const exchangeName = getStringValue(row, [
    "exchangeName", "ExchangeName", "exchange", "Exchange",
    "exchangeDescription", "ExchangeDescription",
    "market", "Market", "marketName", "MarketName",
  ])

  const isLikelyLse = Boolean(
    symbolFull?.match(/\.(L|LSE|LON)$/i)
    || exchangeName?.match(/\b(LSE|London|LON)\b/i)
    || exchangeId === 1
    || exchangeId === 46 // another common eToro LSE exchange ID
  )

  const resolvedCurrencyInfo = currencyInfo.currency !== null
    ? currencyInfo
    : isLikelyLse
      ? { currency: "GBP" as const, priceScale: "gbx" as const }
      : currencyInfo

  logger.debug({
    broker: "etoro",
    instrumentId,
    ticker: resolvedTicker,
    detectedCurrency: resolvedCurrencyInfo.currency,
    priceScale: resolvedCurrencyInfo.priceScale,
    exchangeId,
    exchangeName,
    symbolFull,
    rawCurrency: currencyInfo.currency,
  }, "Mapped eToro instrument metadata")

  return {
    instrumentId,
    ticker: resolvedTicker,
    companyName,
    currency: resolvedCurrencyInfo.currency ?? "USD",
    priceScale: resolvedCurrencyInfo.priceScale,
    assetType: mapMetadataAssetType(row, resolvedName),
  }
}

function getMidPrice(bid: number | null, ask: number | null) {
  if (bid !== null && ask !== null) {
    return (bid + ask) / 2
  }

  return bid ?? ask ?? null
}

function convertNativeToGbp(amount: number, currency: PortfolioPosition["nativeCurrency"]) {
  return currency === "GBP" ? amount : amount * USD_TO_GBP_FALLBACK_RATE
}

function getHistoryMinDate() {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 5)
  return date.toISOString().slice(0, 10)
}

function getEtoroActivityType(isBuy: boolean, phase: EtoroActivityPhase) {
  if (phase === "open") {
    return isBuy ? "buy" : "sell"
  }

  return isBuy ? "sell" : "buy"
}

function getEtoroHistoryPrice(row: EtoroApiRow, phase: EtoroActivityPhase) {
  return getNumberValue(row, phase === "open"
    ? ["openRate", "OpenRate", "openingRate", "OpeningRate", "openPrice", "OpenPrice"]
    : ["closeRate", "CloseRate", "closingRate", "ClosingRate", "closePrice", "ClosePrice"])
}

function getEtoroHistoryUnits(row: EtoroApiRow, phase: EtoroActivityPhase) {
  return getNumberValue(row, phase === "open"
    ? [
      "openUnits",
      "OpenUnits",
      "amountInUnits",
      "AmountInUnits",
      "units",
      "Units",
      "totalUnits",
      "TotalUnits",
    ]
    : [
      "closeUnits",
      "CloseUnits",
      "closedUnits",
      "ClosedUnits",
      "unitsToDeduct",
      "UnitsToDeduct",
      "amountInUnits",
      "AmountInUnits",
      "units",
      "Units",
    ])
}

function deriveEtoroHistoryGrossAmount(row: EtoroApiRow, phase: EtoroActivityPhase, price: number, leverage: number) {
  const amount = getNumberValue(row, phase === "open"
    ? ["amount", "Amount", "openAmount", "OpenAmount", "investedAmount", "InvestedAmount", "requestedAmount", "RequestedAmount"]
    : ["closeAmount", "CloseAmount", "closedAmount", "ClosedAmount", "amount", "Amount", "proceeds", "Proceeds", "realizedAmount", "RealizedAmount"])

  if (amount !== null) {
    return Math.abs(amount)
  }

  const units = getEtoroHistoryUnits(row, phase)

  if (units !== null && units > 0) {
    return (Math.abs(units) * price) / Math.max(leverage, 1)
  }

  return null
}

function getEtoroHistoryShares(row: EtoroApiRow, phase: EtoroActivityPhase, price: number, leverage: number) {
  const units = getEtoroHistoryUnits(row, phase)

  if (units !== null && units > 0) {
    return Math.abs(units)
  }

  const grossAmount = deriveEtoroHistoryGrossAmount(row, phase, price, leverage)

  if (grossAmount !== null) {
    return (grossAmount * leverage) / price
  }

  return null
}

function createEtoroActivityEvent(
  row: EtoroTradeHistoryRow,
  phase: EtoroActivityPhase,
  metadataByInstrumentId: Map<number, EtoroInstrumentMetadata>
): PortfolioActivityEvent | null {
  const normalizedRow = row as unknown as EtoroApiRow
  const instrumentId = getEtoroInstrumentId(normalizedRow)
  const metadata = instrumentId === null ? undefined : metadataByInstrumentId.get(instrumentId)
  const timestamp = getStringValue(normalizedRow, phase === "open" ? ["openTimestamp", "OpenTimestamp"] : ["closeTimestamp", "CloseTimestamp"])
  const rowCurrencyInfo = getEtoroCurrencyInfo(getStringValue(normalizedRow, ["currency", "Currency", "currencyCode", "CurrencyCode"]))
  const priceScale = metadata?.priceScale ?? rowCurrencyInfo.priceScale
  const rawPrice = getEtoroHistoryPrice(normalizedRow, phase)
  const price = rawPrice === null ? null : normalizeEtoroPrice(rawPrice, priceScale)
  const leverage = Math.max(getNumberValue(normalizedRow, ["leverage", "Leverage"]) ?? 1, 1)
  const isBuy = getBooleanValue(normalizedRow, ["isBuy", "IsBuy"])

  // Get shares — prefer explicit units fields
  const shares = price !== null && price > 0 ? getEtoroHistoryShares(normalizedRow, phase, price, leverage) : null

  // For grossAmount: eToro accounts are in USD. The "amount" field (if present) IS the USD value.
  // If not present, derive from units * price, but only if price is in USD.
  // For GBX instruments, units * price gives pence-denominated value which is NOT what we want.
  const explicitAmount = getNumberValue(normalizedRow, phase === "open"
    ? ["amount", "Amount", "openAmount", "OpenAmount", "investedAmount", "InvestedAmount", "requestedAmount", "RequestedAmount"]
    : ["closeAmount", "CloseAmount", "closedAmount", "ClosedAmount", "amount", "Amount", "proceeds", "Proceeds", "realizedAmount", "RealizedAmount"])

  let grossAmount: number | null
  if (explicitAmount !== null) {
    // Explicit amount from eToro is always in account currency (USD)
    grossAmount = Math.abs(explicitAmount)
  } else if (shares !== null && price !== null && price > 0) {
    // Derive: shares * price gives native currency value
    const rawGross = (Math.abs(shares) * price) / Math.max(leverage, 1)
    grossAmount = rawGross
  } else {
    grossAmount = null
  }

  if (instrumentId === null || !timestamp || price === null || shares === null || grossAmount === null || isBuy === null || price <= 0) {
    logger.warn({
      broker: "etoro",
      phase,
      sampleKeys: Object.keys(normalizedRow).slice(0, 16),
      instrumentId,
      hasTimestamp: Boolean(timestamp),
      hasPrice: price !== null,
      hasShares: shares !== null,
      hasGrossAmount: grossAmount !== null,
      hasIsBuy: isBuy !== null,
    }, "Skipped eToro trade-history row because required fields were missing")
    return null
  }

  const nativeCurrency = metadata?.currency ?? rowCurrencyInfo.currency ?? "USD"
  const ticker = metadata?.ticker ?? metadata?.companyName ?? `ET${instrumentId}`
  const companyName = metadata?.companyName ?? ticker
  const positionId = getNumberValue(normalizedRow, ["positionId", "PositionId"]) ?? instrumentId

  // grossAmount is in the instrument's native currency (since we derived from price * shares)
  // UNLESS we got it from explicitAmount (which is in USD for eToro accounts)
  const grossAmountInNative = explicitAmount !== null
    ? (nativeCurrency === "USD" ? grossAmount : grossAmount) // explicitAmount is in USD regardless
    : grossAmount // derived from native price * shares

  // For GBP-denominated conversion: if explicitAmount was USD, convert to GBP
  // If derived from native currency, convert from native to GBP
  const grossAmountGbp = explicitAmount !== null
    ? grossAmount * USD_TO_GBP_FALLBACK_RATE // eToro amounts are always USD
    : convertNativeToGbp(grossAmount, nativeCurrency)

  return {
    id: `etoro:${positionId}:${phase}:${timestamp}:${price}`,
    timestamp,
    broker: "etoro",
    brokerLabel: "eToro",
    ticker,
    companyName,
    type: getEtoroActivityType(isBuy, phase),
    shares,
    price,
    nativeCurrency,
    grossAmount: explicitAmount !== null ? grossAmount : grossAmountInNative,
    grossAmountGbp,
    orderType: phase === "open" ? "Open" : "Close",
  }
}

function mapRateRow(row: EtoroApiRow): EtoroRateSnapshot | null {
  const instrumentId = getEtoroInstrumentId(row)

  if (instrumentId === null) {
    return null
  }

  const bid = getNumberValue(row, ["bid", "Bid", "sell", "Sell", "sellRate", "SellRate"])
  const ask = getNumberValue(row, ["ask", "Ask", "buy", "Buy", "buyRate", "BuyRate"])

  return {
    instrumentId,
    livePrice: getNumberValue(row, [
      "rate",
      "Rate",
      "currentRate",
      "CurrentRate",
      "currentPrice",
      "CurrentPrice",
      "lastPrice",
      "LastPrice",
      "closePrice",
      "ClosePrice",
    ]) ?? getMidPrice(bid, ask),
    recentChange: getNumberValue(row, ["dailyChange", "DailyChange", "changePercent", "ChangePercent", "priceChange", "PriceChange"]) ?? 0,
  }
}

async function fetchEtoroJson<T>(baseUrl: string, path: string, headers: ReturnType<typeof buildEtoroHeaders>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    cache: "no-store",
    headers,
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`${path} -> ${response.status}${responseText.trim() ? ` (${responseText.trim().slice(0, 200)})` : ""}`)
  }

  return await response.json() as T
}

async function fetchEtoroInstrumentMetadata(baseUrl: string, headers: ReturnType<typeof buildEtoroHeaders>, instrumentIds: number[]) {
  if (instrumentIds.length === 0) {
    return new Map<number, EtoroInstrumentMetadata>()
  }

  const payload = await fetchEtoroJson<{ instrumentDisplayDatas?: unknown[] }>(
    baseUrl,
    `/api/v1/market-data/instruments?instrumentIds=${encodeURIComponent(instrumentIds.join(","))}`,
    headers
  )

  return new Map(
    (payload.instrumentDisplayDatas ?? [])
      .filter(isRecord)
      .map(mapInstrumentMetadataRow)
      .filter((entry): entry is EtoroInstrumentMetadata => Boolean(entry))
      .map((entry) => [entry.instrumentId, entry])
  )
}

async function fetchEtoroLiveRates(baseUrl: string, headers: ReturnType<typeof buildEtoroHeaders>, instrumentIds: number[]) {
  if (instrumentIds.length === 0) {
    return new Map<number, EtoroRateSnapshot>()
  }

  const payload = await fetchEtoroJson<{ rates?: unknown[] }>(
    baseUrl,
    `/api/v1/market-data/instruments/rates?instrumentIds=${encodeURIComponent(instrumentIds.join(","))}`,
    headers
  )

  return new Map(
    (payload.rates ?? [])
      .filter(isRecord)
      .map(mapRateRow)
      .filter((entry): entry is EtoroRateSnapshot => Boolean(entry))
      .map((entry) => [entry.instrumentId, entry])
  )
}

function isPositionLikeRow(row: EtoroApiRow) {
  const hasInstrument = hasAnyValue(row, [
    "instrument.ticker",
    "instrument.symbol",
    "instrument.displaySymbol",
    "instrument.code",
    "ticker",
    "symbol",
    "market.symbol",
    "InstrumentID",
    "InstrumentId",
    "instrumentId",
    "instrumentID",
    "PositionID",
    "PositionId",
    "positionId",
  ])

  const hasSize = hasAnyValue(row, [
    "quantity",
    "Quantity",
    "units",
    "Units",
    "AmountInUnits",
    "amountInUnits",
    "openUnits",
    "OpenUnits",
    "totalUnits",
    "TotalUnits",
    "amount",
    "Amount",
  ])

  const hasPricing = hasAnyValue(row, [
    "averageOpen",
    "AverageOpen",
    "averageOpenPrice",
    "AverageOpenPrice",
    "averagePrice",
    "AveragePrice",
    "openRate",
    "OpenRate",
    "currentRate",
    "CurrentRate",
    "marketPrice",
    "MarketPrice",
    "currentPrice",
    "CurrentPrice",
    "price",
    "Price",
    "lastPrice",
    "LastPrice",
  ])

  return hasInstrument && hasSize && hasPricing
}

function collectNestedRecords(value: unknown): EtoroApiRow[] {
  if (Array.isArray(value)) {
    const records = value.filter(isRecord)

    if (records.some(isPositionLikeRow)) {
      return records.filter(isPositionLikeRow)
    }

    return []
  }

  if (!isRecord(value)) {
    return []
  }

  for (const key of ETORO_POSITION_CONTAINER_KEYS) {
    const candidate = value[key]

    if (Array.isArray(candidate)) {
      const positionRecords = candidate.filter(isRecord).filter(isPositionLikeRow)

      if (positionRecords.length > 0) {
        return positionRecords
      }
    }
  }

  for (const nestedValue of Object.values(value)) {
    if (isRecord(nestedValue)) {
      const nestedRecords = collectNestedRecords(nestedValue)

      if (nestedRecords.length > 0) {
        return nestedRecords
      }
    }
  }

  return []
}

function extractEtoroRows(payload: unknown): EtoroApiRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  if (!isRecord(payload)) {
    throw new Error("eToro returned an unexpected response format.")
  }

  const clientPortfolioRows = collectNestedRecords(payload.clientPortfolio)

  if (clientPortfolioRows.length > 0) {
    return clientPortfolioRows
  }

  const topLevelRows = collectNestedRecords(payload)

  if (topLevelRows.length > 0) {
    return topLevelRows
  }

  throw new Error("eToro returned an unexpected portfolio payload.")
}

function mapEtoroRowToPosition(
  row: EtoroApiRow,
  metadataByInstrumentId: Map<number, EtoroInstrumentMetadata> = new Map(),
  ratesByInstrumentId: Map<number, EtoroRateSnapshot> = new Map()
): PortfolioPosition | null {
  const instrumentId = getEtoroInstrumentId(row)
  const metadata = instrumentId === null ? undefined : metadataByInstrumentId.get(instrumentId)
  const rateSnapshot = instrumentId === null ? undefined : ratesByInstrumentId.get(instrumentId)
  const isBuy = getBooleanValue(row, ["isBuy", "IsBuy", "direction", "Direction"])
  const rowCurrencyValue = getStringValue(row, [
    "currency",
    "Currency",
    "currencyCode",
    "CurrencyCode",
    "instrument.currency",
    "instrument.currencyCode",
    "market.currency",
  ])
  const rowCurrencyInfo = getEtoroCurrencyInfo(rowCurrencyValue)
  const priceScale = metadata?.priceScale ?? rowCurrencyInfo.priceScale

  if (isBuy === false) {
    return null
  }

  const ticker = getStringValue(row, [
    "instrument.ticker",
    "instrument.symbol",
    "instrument.displaySymbol",
    "instrument.DisplaySymbol",
    "symbol",
    "Symbol",
    "ticker",
    "Ticker",
    "market.symbol",
    "instrument.code",
    "InstrumentID",
    "InstrumentId",
    "instrumentId",
    "instrumentID",
  ]) ?? metadata?.ticker ?? metadata?.companyName ?? (instrumentId !== null ? `ET${instrumentId}` : null)
  const shares = getNumberValue(row, [
    "quantity",
    "Quantity",
    "units",
    "Units",
    "amount",
    "Amount",
    "shares",
    "Shares",
    "openUnits",
    "OpenUnits",
    "totalUnits",
    "TotalUnits",
    "AmountInUnits",
    "amountInUnits",
  ])
  const totalCost = getNumberValue(row, [
    "investedAmount",
    "InvestedAmount",
    "amountInvested",
    "AmountInvested",
    "costBasis",
    "CostBasis",
    "position.costBasis",
    "totalCost",
    "TotalCost",
    "Amount",
  ])
  const currentValue = getNumberValue(row, [
    "currentValue",
    "CurrentValue",
    "marketValue",
    "MarketValue",
    "positionValue",
    "PositionValue",
    "value",
    "Value",
  ])
  const rawAveragePrice = getNumberValue(row, [
    "averageOpen",
    "AverageOpen",
    "averageOpenPrice",
    "AverageOpenPrice",
    "averagePrice",
    "AveragePrice",
    "avgPrice",
    "AvgPrice",
    "openRate",
    "OpenRate",
  ])
  const averagePrice = rawAveragePrice === null ? null : normalizeEtoroPrice(rawAveragePrice, priceScale)
  const leverage = Math.max(getNumberValue(row, ["leverage", "Leverage"]) ?? 1, 1)
  const derivedShares = averagePrice !== null && averagePrice > 0 && totalCost !== null
    ? (totalCost * leverage) / averagePrice
    : null
  const resolvedShares = shares ?? derivedShares
  const resolvedAveragePrice = averagePrice
    ?? (resolvedShares && resolvedShares > 0 && totalCost !== null ? (totalCost * leverage) / resolvedShares : null)
  const rawLivePrice = getNumberValue(row, [
    "marketPrice",
    "MarketPrice",
    "currentRate",
    "CurrentRate",
    "currentPrice",
    "CurrentPrice",
    "price",
    "Price",
    "lastPrice",
    "LastPrice",
    "Rate",
    "rate",
  ])
  const livePrice = (rawLivePrice === null ? null : normalizeEtoroPrice(rawLivePrice, priceScale))
    ?? (rateSnapshot?.livePrice === null || rateSnapshot?.livePrice === undefined ? null : normalizeEtoroPrice(rateSnapshot.livePrice, priceScale))
    ?? (resolvedShares && resolvedShares > 0 && currentValue !== null ? currentValue / resolvedShares : null)
  const companyName = getStringValue(row, [
    "instrument.name",
    "instrument.Name",
    "displayName",
    "DisplayName",
    "name",
    "Name",
    "market.name",
    "instrument.displayName",
  ]) ?? metadata?.companyName
  const currency = rowCurrencyInfo.currency
    ?? metadata?.currency
    ?? "USD"
  const recentChange = getNumberValue(row, [
    "dailyChange",
    "DailyChange",
    "changePercent",
    "ChangePercent",
    "currentPriceChange",
    "CurrentPriceChange",
    "priceChange",
    "PriceChange",
    "recentChange",
    "RecentChange",
  ]) ?? rateSnapshot?.recentChange ?? 0

  if (!ticker || resolvedShares === null || resolvedAveragePrice === null || livePrice === null || !currency || resolvedShares <= 0) {
    return null
  }

  const resolvedCompanyName = companyName ?? ticker

  return normalizeImportedHolding({
    broker: "etoro",
    brokerLabel: "eToro",
    ticker,
    companyName: resolvedCompanyName,
    shares: resolvedShares,
    avgPrice: resolvedAveragePrice,
    livePrice,
    nativeCurrency: currency,
    assetType: metadata?.assetType ?? normalizeEtoroAssetType(row, resolvedCompanyName),
    recentChange,
  })
}

function normalizeEtoroCredentials(credentials?: string | BrokerApiCredentials) {
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

function getEtoroPortfolioPaths() {
  const configuredPaths = process.env.ETORO_PORTFOLIO_PATHS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  if (configuredPaths && configuredPaths.length > 0) {
    return configuredPaths
  }

  const mode = process.env.ETORO_ACCOUNT_MODE?.trim().toLowerCase()

  if (mode === "demo") {
    return [DEFAULT_ETORO_DEMO_PORTFOLIO_PATH, DEFAULT_ETORO_DEMO_PNL_PATH]
  }

  return [DEFAULT_ETORO_REAL_PORTFOLIO_PATH, DEFAULT_ETORO_REAL_PNL_PATH]
}

function buildEtoroHeaders(apiKey: string, apiSecret: string) {
  return {
    Accept: "application/json",
    "x-request-id": crypto.randomUUID(),
    "x-api-key": apiKey,
    "x-user-key": apiSecret,
  }
}

function mapEtoroRowsToPositions(
  rows: EtoroApiRow[],
  metadataByInstrumentId: Map<number, EtoroInstrumentMetadata> = new Map(),
  ratesByInstrumentId: Map<number, EtoroRateSnapshot> = new Map()
) {
  return rows
    .map((row) => mapEtoroRowToPosition(row, metadataByInstrumentId, ratesByInstrumentId))
    .filter((position): position is PortfolioPosition => Boolean(position))
}

export function mapEtoroPortfolioResponse(payload: unknown): PortfolioPosition[] {
  const rows = extractEtoroRows(payload)
  const positions = mapEtoroRowsToPositions(rows)

  if (rows.length > 0 && positions.length === 0) {
    const sampleKeys = Object.keys(rows[0] ?? {}).slice(0, 12).join(", ") || "unknown"
    throw new Error(
      `eToro responded successfully, but none of the returned positions matched the portfolio fields this app currently supports. Sample row keys: ${sampleKeys}. If eToro changed its payload shape, update the live mapper or configure ETORO_PORTFOLIO_PATHS for the correct positions endpoint.`
    )
  }

  return positions
}

export async function fetchEtoroPortfolioFromApi(credentials?: string | BrokerApiCredentials): Promise<PortfolioPosition[]> {
  const { apiKey, apiSecret } = normalizeEtoroCredentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("eToro requires both an API key and a user key before syncing.")
  }

  const baseUrl = process.env.ETORO_API_BASE_URL?.trim() || DEFAULT_ETORO_API_BASE_URL
  const attemptedResponses: string[] = []
  const headers = buildEtoroHeaders(apiKey, apiSecret)

  logger.info({ broker: "etoro", mode: process.env.ETORO_ACCOUNT_MODE?.trim().toLowerCase() || "real" }, "Starting eToro portfolio sync")

  for (const path of getEtoroPortfolioPaths()) {
    logger.debug({ broker: "etoro", path }, "Requesting eToro portfolio endpoint")
    const response = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      cache: "no-store",
      headers,
    })

    if (!response.ok) {
      const responseText = await response.text()
      logger.warn({ broker: "etoro", path, status: response.status, bodyPreview: responseText.trim().slice(0, 200) }, "eToro portfolio endpoint returned a non-OK response")
      attemptedResponses.push(`${path} -> ${response.status}${responseText.trim() ? ` (${responseText.trim().slice(0, 140)})` : ""}`)
      continue
    }

    const payload = await response.json()
    const rows = extractEtoroRows(payload)
    const instrumentIds = Array.from(new Set(rows.map(getEtoroInstrumentId).filter((value): value is number => value !== null)))

    logger.info({ broker: "etoro", path, rows: rows.length, instrumentIds: instrumentIds.length }, "Loaded eToro portfolio rows")

    let metadataByInstrumentId: Map<number, EtoroInstrumentMetadata>
    let ratesByInstrumentId: Map<number, EtoroRateSnapshot>

    try {
      ;[metadataByInstrumentId, ratesByInstrumentId] = await Promise.all([
        fetchEtoroInstrumentMetadata(baseUrl, headers, instrumentIds),
        fetchEtoroLiveRates(baseUrl, headers, instrumentIds),
      ])
      logger.debug({ broker: "etoro", metadataCount: metadataByInstrumentId.size, rateCount: ratesByInstrumentId.size }, "eToro enrichment data loaded")
    } catch (error) {
      logger.error({ broker: "etoro", error: getErrorLogDetails(error) }, "eToro enrichment failed")
      const detail = error instanceof Error ? error.message : "Unable to enrich eToro positions with instrument metadata and live rates."
      throw new Error(`eToro portfolio data loaded, but enrichment failed. ${detail}`)
    }

    const positions = mapEtoroRowsToPositions(rows, metadataByInstrumentId, ratesByInstrumentId)

    logger.info({ broker: "etoro", positions: positions.length }, "Mapped eToro portfolio positions")

    if (rows.length > 0 && positions.length === 0) {
      const sampleKeys = Object.keys(rows[0] ?? {}).slice(0, 12).join(", ") || "unknown"
      logger.warn({ broker: "etoro", sampleKeys }, "eToro portfolio rows loaded but none mapped into positions")
      throw new Error(`eToro responded successfully, but none of the returned positions matched the portfolio fields this app currently supports. Sample row keys: ${sampleKeys}.`)
    }

    return positions
  }

  throw new Error(
    attemptedResponses.length > 0
      ? `Failed to load the eToro portfolio from the API. Tried: ${attemptedResponses.join("; ")}. The documented real-account path is ${DEFAULT_ETORO_REAL_PORTFOLIO_PATH} on ${baseUrl}; if your account uses demo mode or a different documented path, set ETORO_ACCOUNT_MODE or ETORO_PORTFOLIO_PATHS.`
      : "Failed to load the eToro portfolio from the API."
  )
}

export async function fetchEtoroActivityFromApi(credentials?: string | BrokerApiCredentials): Promise<PortfolioActivityEvent[]> {
  const { apiKey, apiSecret } = normalizeEtoroCredentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("eToro requires both an API key and a user key before syncing history.")
  }

  const baseUrl = process.env.ETORO_API_BASE_URL?.trim() || DEFAULT_ETORO_API_BASE_URL
  const headers = buildEtoroHeaders(apiKey, apiSecret)
  const historyPath = `${DEFAULT_ETORO_TRADE_HISTORY_PATH}?minDate=${encodeURIComponent(getHistoryMinDate())}&page=1&pageSize=500`
  logger.info({ broker: "etoro", historyPath }, "Requesting eToro trade history")
  const payload = await fetchEtoroJson<unknown[]>(baseUrl, historyPath, headers)
  const historyRows = payload.filter(isRecord) as EtoroTradeHistoryRow[]
  const instrumentIds = Array.from(new Set(historyRows
    .map((row) => getEtoroInstrumentId(row as unknown as EtoroApiRow))
    .filter((value): value is number => value !== null)))
  const metadataByInstrumentId = await fetchEtoroInstrumentMetadata(baseUrl, headers, instrumentIds)

  // Also fetch live rates to help detect pence-priced instruments
  // If an instrument's live rate is >200 and metadata says "USD", it's almost certainly GBX
  let ratesByInstrumentId: Map<number, EtoroRateSnapshot> = new Map()
  try {
    ratesByInstrumentId = await fetchEtoroLiveRates(baseUrl, headers, instrumentIds)
  } catch {
    // Non-critical — just won't have rate-based pence detection
  }

  // Post-process metadata: use live rates to detect pence-priced instruments
  // that the metadata endpoint didn't identify as GBp
  for (const [id, metadata] of metadataByInstrumentId) {
    if (metadata.priceScale === "standard" && metadata.currency === "USD") {
      const rate = ratesByInstrumentId.get(id)
      // If live price > 200, this is almost certainly a pence-denominated UK stock
      // (no real USD stock trades at >$200 per share commonly, but UK pence prices of 200-5000 are normal)
      // More conservative: >500 is very likely pence
      if (rate?.livePrice && rate.livePrice > 200) {
        logger.info({ broker: "etoro", instrumentId: id, ticker: metadata.ticker, livePrice: rate.livePrice }, "Detected likely GBX instrument from live rate magnitude")
        metadata.currency = "GBP"
        metadata.priceScale = "gbx"
      }
    }
  }

  logger.info({ broker: "etoro", historyRows: historyRows.length, historyInstrumentIds: instrumentIds.length }, "Loaded eToro trade history rows")

  const activity = historyRows.flatMap((row) => {
    const openEvent = createEtoroActivityEvent(row, "open", metadataByInstrumentId)
    const closeEvent = createEtoroActivityEvent(row, "close", metadataByInstrumentId)
    return [openEvent, closeEvent].filter((event): event is PortfolioActivityEvent => Boolean(event))
  })

  logger.info({ broker: "etoro", activityEvents: activity.length }, "Mapped eToro trade history into activity events")

  return activity
}

