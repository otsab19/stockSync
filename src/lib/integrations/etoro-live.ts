import { inferAssetType, normalizeImportedHolding, normalizeTickerSymbol } from "@/lib/portfolio/position-normalizer"
import { logger, getErrorLogDetails } from "@/lib/backend/logger"
import { buildOrderPreview } from "@/lib/orders/validation"
import type { BrokerInstrument, BrokerInstrumentQuote } from "@/lib/integrations/provider"
import type { BrokerApiCredentials } from "@/types/integrations"
import type { BrokerOrderResult, OrderCapability, TradeOrderRequest } from "@/types/orders"
import type { AssetType, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"
import type { Json } from "@/types/supabase"

const DEFAULT_ETORO_API_BASE_URL = "https://public-api.etoro.com"
const DEFAULT_ETORO_REAL_PORTFOLIO_PATH = "/api/v1/trading/info/portfolio"
const DEFAULT_ETORO_REAL_PNL_PATH = "/api/v1/trading/info/real/pnl"
const DEFAULT_ETORO_DEMO_PORTFOLIO_PATH = "/api/v1/trading/info/demo/portfolio"
const DEFAULT_ETORO_DEMO_PNL_PATH = "/api/v1/trading/info/demo/pnl"
const DEFAULT_ETORO_REAL_TRADE_HISTORY_PATH = "/api/v1/trading/info/real/history"
const LEGACY_ETORO_TRADE_HISTORY_PATH = "/api/v1/trading/info/trade/history"
const DEFAULT_ETORO_DEMO_TRADE_HISTORY_PATH = "/api/v1/trading/info/demo/history"
const DEFAULT_ETORO_REAL_ORDER_PATH = "/api/v1/trading/orders"
const USD_TO_GBP_FALLBACK_RATE = 0.79

/**
 * Clean an eToro ticker:
 * - Strip London Stock Exchange suffixes (.L, .l, .LSE, .LON)
 * - Strip trailing lowercase "l" that eToro appends to LSE tickers (e.g. "RRl" → "RR")
 * - Apply known ticker renames (e.g. GIG → BBAI)
 */
function cleanEtoroTicker(rawTicker: string, isLseListed: boolean): string {
  return normalizeTickerSymbol(rawTicker, { isLseListed })
}

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

type EtoroSearchResponse = EtoroApiRow[] | {
  instruments?: unknown[]
  results?: unknown[]
  items?: unknown[]
  data?: unknown[]
  instrumentDisplayDatas?: unknown[]
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

type EtoroHistoryResponse = EtoroApiRow[] | {
  items?: unknown[]
  data?: unknown[]
  history?: unknown[]
  trades?: unknown[]
  positions?: unknown[]
  totalPages?: number
  TotalPages?: number
  nextPage?: number | null
  NextPage?: number | null
  nextPagePath?: string | null
  NextPagePath?: string | null
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
    "symbolFull",
    "SymbolFull",
    "internalSymbolFull",
    "InternalSymbolFull",
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
    "priceSource", "PriceSource",
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

function getConfiguredEtoroAccountCurrency(): PortfolioPosition["nativeCurrency"] | null {
  const value = process.env.ETORO_ACCOUNT_CURRENCY?.trim().toUpperCase()
  if (value === "GBP" || value === "USD") return value
  return null
}

function estimateEtoroOpenNotional(
  row: EtoroApiRow,
  metadataByInstrumentId: Map<number, EtoroInstrumentMetadata>
) {
  const instrumentId = getEtoroInstrumentId(row)
  const metadata = instrumentId === null ? undefined : metadataByInstrumentId.get(instrumentId)
  const historyTicker = getStringValue(row, ["symbolFull", "SymbolFull", "ticker", "Ticker", "symbol", "Symbol"])
  const historyExchangeName = getStringValue(row, [
    "exchangeName", "ExchangeName", "exchange", "Exchange",
    "exchangeDescription", "ExchangeDescription",
    "market", "Market", "marketName", "MarketName",
  ])
  const historyExchangeId = getNumberValue(row, ["exchangeID", "ExchangeID", "exchangeId", "ExchangeId"])
  const isHistoryLse = Boolean(
    historyTicker?.match(/\.(L|LSE|LON)$/i)
    || historyTicker?.match(/^[A-Z]+l$/)
    || historyExchangeName?.match(/\b(LSE|London|LON)\b/i)
    || historyExchangeId === 1
    || historyExchangeId === 46
  )
  const rowCurrencyInfo = getEtoroCurrencyInfo(getStringValue(row, ["currency", "Currency", "currencyCode", "CurrencyCode"]))
  const rawOpenRate = getEtoroHistoryPrice(row, "open")
  const rawCloseRate = getEtoroHistoryPrice(row, "close")
  const historyUnits = getEtoroHistoryUnits(row, "open")
    ?? getEtoroHistoryUnits(row, "close")
  const historyInvestment = getNumberValue(row, [
    "investment",
    "Investment",
    "initialInvestment",
    "InitialInvestment",
    "amount",
    "Amount",
    "openAmount",
    "OpenAmount",
    "investedAmount",
    "InvestedAmount",
    "requestedAmount",
    "RequestedAmount",
  ])
  const priceScale = inferEtoroHistoryPriceScale({
    metadata,
    isHistoryLse,
    rowCurrencyInfo,
    rawOpenRate,
    rawCloseRate,
    units: historyUnits,
    investment: historyInvestment,
  })
  const openPrice = rawOpenRate === null ? null : normalizeEtoroPrice(rawOpenRate, priceScale)
  const leverage = Math.max(getNumberValue(row, ["leverage", "Leverage"]) ?? 1, 1)
  const shares = openPrice !== null && openPrice > 0
    ? getEtoroHistoryShares(row, "open", openPrice, leverage)
    : historyUnits
  const nativeCurrency = metadata?.currency ?? (isHistoryLse || priceScale === "gbx" ? "GBP" : rowCurrencyInfo.currency ?? "USD")

  if (shares === null || openPrice === null || openPrice <= 0) {
    return null
  }

  const nativeNotional = (Math.abs(shares) * openPrice) / leverage
  const notionalGbp = convertNativeToGbp(nativeNotional, nativeCurrency)
  const notionalUsd = nativeCurrency === "USD" ? nativeNotional : nativeNotional / USD_TO_GBP_FALLBACK_RATE

  return { investment: historyInvestment, notionalGbp, notionalUsd }
}

export function inferEtoroAccountCurrency(
  rows: EtoroTradeHistoryRow[],
  metadataByInstrumentId: Map<number, EtoroInstrumentMetadata> = new Map()
): PortfolioPosition["nativeCurrency"] {
  const configured = getConfiguredEtoroAccountCurrency()
  if (configured) return configured

  let gbpWins = 0
  let usdWins = 0

  rows.forEach((row) => {
    const estimate = estimateEtoroOpenNotional(row as unknown as EtoroApiRow, metadataByInstrumentId)
    if (!estimate || estimate.investment === null) return

    const { investment, notionalGbp, notionalUsd } = estimate
    const gbpDistance = Math.abs(investment - notionalGbp) / Math.max(notionalGbp, 1)
    const usdDistance = Math.abs(investment - notionalUsd) / Math.max(notionalUsd, 1)

    if (gbpDistance + 0.05 < usdDistance) gbpWins += 1
    else if (usdDistance + 0.05 < gbpDistance) usdWins += 1
  })

  return gbpWins > usdWins ? "GBP" : "USD"
}

function getHistoryMinDate() {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 5)
  return date.toISOString().slice(0, 10)
}

function getEtoroTradeHistoryPaths() {
  const configuredPaths = process.env.ETORO_TRADE_HISTORY_PATHS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  if (configuredPaths && configuredPaths.length > 0) {
    return configuredPaths
  }

  const mode = process.env.ETORO_ACCOUNT_MODE?.trim().toLowerCase()

  if (mode === "demo") {
    return [DEFAULT_ETORO_DEMO_TRADE_HISTORY_PATH]
  }

  return [DEFAULT_ETORO_REAL_TRADE_HISTORY_PATH, LEGACY_ETORO_TRADE_HISTORY_PATH]
}

function getEtoroActivityType(isBuy: boolean, phase: EtoroActivityPhase) {
  if (phase === "open") {
    return isBuy ? "buy" : "sell"
  }

  return isBuy ? "sell" : "buy"
}

function getEtoroHistoryPrice(row: EtoroApiRow, phase: EtoroActivityPhase) {
  return getNumberValue(row, phase === "open"
    ? ["openRate", "OpenRate", "openingRate", "OpeningRate", "openPrice", "OpenPrice", "openExecutionRate", "OpenExecutionRate"]
    : ["closeRate", "CloseRate", "closingRate", "ClosingRate", "closePrice", "ClosePrice", "closeExecutionRate", "CloseExecutionRate", "executionRate", "ExecutionRate"])
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
    ? ["investment", "Investment", "initialInvestment", "InitialInvestment", "amount", "Amount", "openAmount", "OpenAmount", "investedAmount", "InvestedAmount", "requestedAmount", "RequestedAmount"]
    : ["investment", "Investment", "initialInvestment", "InitialInvestment", "closeAmount", "CloseAmount", "closedAmount", "ClosedAmount", "proceeds", "Proceeds", "realizedAmount", "RealizedAmount"])

  if (amount !== null) {
    return Math.abs(amount)
  }

  const units = getEtoroHistoryUnits(row, phase)

  if (units !== null && units > 0) {
    return (Math.abs(units) * price) / Math.max(leverage, 1)
  }

  return null
}

function inferEtoroHistoryPriceScale(params: {
  metadata?: EtoroInstrumentMetadata
  isHistoryLse: boolean
  rowCurrencyInfo: ReturnType<typeof getEtoroCurrencyInfo>
  rawOpenRate: number | null
  rawCloseRate: number | null
  units: number | null
  investment: number | null
}) {
  if (params.metadata?.priceScale === "gbx") {
    return "gbx" as const
  }

  if (params.isHistoryLse || params.metadata?.currency === "GBP") {
    return "gbx" as const
  }

  if (params.rowCurrencyInfo.priceScale === "gbx") {
    return "gbx" as const
  }

  const rawRate = params.rawOpenRate ?? params.rawCloseRate

  if (
    rawRate !== null
    && params.units !== null
    && params.units > 0
    && params.investment !== null
    && params.investment > 0
  ) {
    const notionalStandard = params.units * rawRate
    const notionalGbx = params.units * (rawRate / 100)
    const ratioStandard = notionalStandard / params.investment
    const ratioGbx = notionalGbx / params.investment

    if (ratioGbx >= 0.25 && ratioGbx <= 4 && (ratioStandard > 12 || ratioStandard < 0.08)) {
      return "gbx" as const
    }
  }

  return params.metadata?.priceScale ?? params.rowCurrencyInfo.priceScale
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
  metadataByInstrumentId: Map<number, EtoroInstrumentMetadata>,
  accountCurrency: PortfolioPosition["nativeCurrency"]
): PortfolioActivityEvent | null {
  const normalizedRow = row as unknown as EtoroApiRow
  const instrumentId = getEtoroInstrumentId(normalizedRow)
  const metadata = instrumentId === null ? undefined : metadataByInstrumentId.get(instrumentId)
  const timestamp = getStringValue(normalizedRow, phase === "open"
    ? ["openTimestamp", "OpenTimestamp", "openDateTime", "OpenDateTime", "openDate", "OpenDate", "createdAt", "CreatedAt"]
    : ["closeTimestamp", "CloseTimestamp", "closeDateTime", "CloseDateTime", "closeDate", "CloseDate", "lastUpdate", "LastUpdate", "closedAt", "ClosedAt", "updatedAt", "UpdatedAt"])
  const historyTicker = getStringValue(normalizedRow, [
    "symbolFull",
    "SymbolFull",
    "internalSymbolFull",
    "InternalSymbolFull",
    "ticker",
    "Ticker",
    "symbol",
    "Symbol",
    "displaySymbol",
    "DisplaySymbol",
    "instrumentDisplayName",
    "InstrumentDisplayName",
    "instrumentName",
    "InstrumentName",
  ])
  const historyCompanyName = getStringValue(normalizedRow, [
    "instrumentDisplayName",
    "InstrumentDisplayName",
    "instrumentName",
    "InstrumentName",
    "displayName",
    "DisplayName",
    "name",
    "Name",
    "companyName",
    "CompanyName",
  ])
  const historyPriceSource = getStringValue(normalizedRow, ["priceSource", "PriceSource"])
  const historyExchangeName = getStringValue(normalizedRow, [
    "exchangeName", "ExchangeName", "exchange", "Exchange",
    "exchangeDescription", "ExchangeDescription",
    "market", "Market", "marketName", "MarketName",
  ])
  const historyExchangeId = getNumberValue(normalizedRow, ["exchangeID", "ExchangeID", "exchangeId", "ExchangeId"])
  const isHistoryLse = Boolean(
    historyTicker?.match(/\.(L|LSE|LON)$/i)
    || historyTicker?.match(/^[A-Z]+l$/)
    || historyPriceSource?.match(/\b(LSE|London|LON)\b/i)
    || historyExchangeName?.match(/\b(LSE|London|LON)\b/i)
    || historyExchangeId === 1
    || historyExchangeId === 46
  )
  const rowCurrencyInfo = getEtoroCurrencyInfo(getStringValue(normalizedRow, ["currency", "Currency", "currencyCode", "CurrencyCode"]))
  const rawOpenRate = getEtoroHistoryPrice(normalizedRow, "open")
  const rawCloseRate = getEtoroHistoryPrice(normalizedRow, "close")
  const historyUnits = getEtoroHistoryUnits(normalizedRow, phase)
    ?? getEtoroHistoryUnits(normalizedRow, "open")
    ?? getEtoroHistoryUnits(normalizedRow, "close")
  const historyInvestment = getNumberValue(normalizedRow, [
    "investment",
    "Investment",
    "initialInvestment",
    "InitialInvestment",
    "amount",
    "Amount",
    "openAmount",
    "OpenAmount",
    "investedAmount",
    "InvestedAmount",
    "requestedAmount",
    "RequestedAmount",
  ])
  const priceScale = inferEtoroHistoryPriceScale({
    metadata,
    isHistoryLse,
    rowCurrencyInfo,
    rawOpenRate,
    rawCloseRate,
    units: historyUnits,
    investment: historyInvestment,
  })
  const rawPrice = phase === "open" ? rawOpenRate : rawCloseRate
  const price = rawPrice === null ? null : normalizeEtoroPrice(rawPrice, priceScale)
  const leverage = Math.max(getNumberValue(normalizedRow, ["leverage", "Leverage"]) ?? 1, 1)
  const parsedIsBuy = getBooleanValue(normalizedRow, ["isBuy", "IsBuy", "direction", "Direction", "side", "Side"])
  const isBuy = parsedIsBuy ?? true

  // Get shares — prefer explicit units fields, fall back to deriving from netProfit
  let shares = price !== null && price > 0 ? getEtoroHistoryShares(normalizedRow, phase, price, leverage) : null

  // Fallback: derive shares from netProfit and open/close rates if no explicit units/amount
  if (shares === null && phase === "close") {
    const netProfit = getNumberValue(normalizedRow, ["netProfit", "NetProfit", "profit", "Profit", "pnl", "Pnl", "PnL"])
    const normalizedOpenRate = rawOpenRate === null ? null : normalizeEtoroPrice(rawOpenRate, priceScale)
    const normalizedCloseRate = rawCloseRate === null ? null : normalizeEtoroPrice(rawCloseRate, priceScale)
    if (netProfit !== null && normalizedOpenRate !== null && normalizedCloseRate !== null && normalizedCloseRate !== normalizedOpenRate) {
      shares = Math.abs(netProfit * leverage / (normalizedCloseRate - normalizedOpenRate))
    }
  }
  // For open phase: if we can derive from netProfit on the close side, use those same units
  if (shares === null && phase === "open") {
    const netProfit = getNumberValue(normalizedRow, ["netProfit", "NetProfit", "profit", "Profit", "pnl", "Pnl", "PnL"])
    const normalizedOpenRate = rawOpenRate === null ? null : normalizeEtoroPrice(rawOpenRate, priceScale)
    const normalizedCloseRate = rawCloseRate === null ? null : normalizeEtoroPrice(rawCloseRate, priceScale)
    if (netProfit !== null && normalizedOpenRate !== null && normalizedCloseRate !== null && normalizedCloseRate !== normalizedOpenRate) {
      shares = Math.abs(netProfit * leverage / (normalizedCloseRate - normalizedOpenRate))
    }
  }

  // For grossAmount: eToro accounts are in USD. The "amount" field (if present) IS the USD invested value.
  // IMPORTANT: for close phase, do NOT fall back to "amount"/"Amount" — that's the OPEN invested amount.
  // Only use close-specific fields (closeAmount, closedAmount, proceeds, realizedAmount).
  const explicitAmount = getNumberValue(normalizedRow, phase === "open"
    ? ["investment", "Investment", "initialInvestment", "InitialInvestment", "amount", "Amount", "openAmount", "OpenAmount", "investedAmount", "InvestedAmount", "requestedAmount", "RequestedAmount"]
    : ["investment", "Investment", "initialInvestment", "InitialInvestment", "closeAmount", "CloseAmount", "closedAmount", "ClosedAmount", "proceeds", "Proceeds", "realizedAmount", "RealizedAmount"])

  let grossAmount: number | null
  if (explicitAmount !== null) {
    // Explicit amount from eToro is always in account currency (USD)
    grossAmount = Math.abs(explicitAmount)
  } else if (shares !== null && price !== null && price > 0) {
    // Derive: shares * price gives native currency value
    grossAmount = (Math.abs(shares) * price) / Math.max(leverage, 1)
  } else {
    grossAmount = null
  }

  if (instrumentId === null || !timestamp || price === null || shares === null || grossAmount === null || price <= 0) {
    logger.warn({
      broker: "etoro",
      phase,
      sampleKeys: Object.keys(normalizedRow).slice(0, 16),
      instrumentId,
      hasTimestamp: Boolean(timestamp),
      hasPrice: price !== null,
      hasShares: shares !== null,
      hasGrossAmount: grossAmount !== null,
      hasIsBuy: parsedIsBuy !== null,
    }, "Skipped eToro trade-history row because required fields were missing")
    return null
  }

  const nativeCurrency = metadata?.currency ?? (isHistoryLse || priceScale === "gbx" ? "GBP" : rowCurrencyInfo.currency ?? "USD")
  const isLse = metadata?.priceScale === "gbx" || nativeCurrency === "GBP" || priceScale === "gbx"
  const rawTicker = metadata?.ticker ?? historyTicker ?? `ET${instrumentId}`
  const ticker = cleanEtoroTicker(rawTicker, isLse)
  const companyName = metadata?.companyName ?? historyCompanyName ?? ticker
  const openTimestamp = getStringValue(normalizedRow, [
    "openTimestamp", "OpenTimestamp", "openDateTime", "OpenDateTime", "openDate", "OpenDate", "createdAt", "CreatedAt",
  ])
  const closeTimestamp = getStringValue(normalizedRow, [
    "closeTimestamp", "CloseTimestamp", "closeDateTime", "CloseDateTime", "closeDate", "CloseDate", "lastUpdate", "LastUpdate", "closedAt", "ClosedAt", "updatedAt", "UpdatedAt",
  ])
  const apiPositionId = getNumberValue(normalizedRow, ["positionId", "PositionId"])
  const positionId = apiPositionId
    ?? (instrumentId !== null
      ? `${instrumentId}:${openTimestamp ?? ""}:${closeTimestamp ?? ""}`
      : null)

  // For consistent P&L calculations, ALWAYS derive grossAmountGbp from shares * price in native currency.
  // This ensures buy and sell events for the same stock are comparable.
  // The explicit "amount" from eToro (in USD) uses a static FX rate that creates inconsistencies
  // when compared to derived close amounts.
  const nativeGrossAmount = (Math.abs(shares) * price) / Math.max(leverage, 1)
  const grossAmountGbp = convertNativeToGbp(nativeGrossAmount, nativeCurrency)
  const closeNetProfit = phase === "close"
    ? getNumberValue(normalizedRow, ["netProfit", "NetProfit", "profit", "Profit", "pnl", "Pnl", "PnL"])
    : null
  const realisedProfitGbp = closeNetProfit !== null
    ? convertNativeToGbp(closeNetProfit, accountCurrency)
    : undefined

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
    grossAmount: nativeGrossAmount,
    grossAmountGbp,
    realisedProfitGbp,
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

function extractEtoroSearchRows(payload: EtoroSearchResponse): EtoroApiRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  const candidates = [
    payload.instruments,
    payload.results,
    payload.items,
    payload.data,
    payload.instrumentDisplayDatas,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
  }

  return []
}

function extractEtoroHistoryRows(payload: EtoroHistoryResponse): EtoroApiRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }

  const candidates = [
    payload.items,
    payload.data,
    payload.history,
    payload.trades,
    payload.positions,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
  }

  return []
}

function getEtoroHistoryNextPage(payload: EtoroHistoryResponse, currentPage: number) {
  if (Array.isArray(payload)) {
    return null
  }

  const explicitNextPage = payload.nextPage ?? payload.NextPage
  if (typeof explicitNextPage === "number" && Number.isFinite(explicitNextPage)) {
    return explicitNextPage
  }

  const totalPages = payload.totalPages ?? payload.TotalPages
  if (typeof totalPages === "number" && currentPage < totalPages) {
    return currentPage + 1
  }

  return null
}

function getEtoroHistoryNextPath(payload: EtoroHistoryResponse) {
  if (Array.isArray(payload)) {
    return null
  }

  const path = payload.nextPagePath ?? payload.NextPagePath ?? null
  if (!path) {
    return null
  }

  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path)
    return `${url.pathname}${url.search}`
  }

  return path.startsWith("/") ? path : `/${path}`
}

function buildEtoroHistoryPath(baseHistoryPath: string, page: number, includeNames: boolean) {
  const params = new URLSearchParams({
    minDate: getHistoryMinDate(),
    page: String(page),
    pageSize: "500",
  })

  if (includeNames) {
    params.set("includeNames", "true")
  }

  return `${baseHistoryPath}?${params.toString()}`
}

function getEtoroHistoryRowKey(row: EtoroApiRow) {
  const instrumentId = getEtoroInstrumentId(row) ?? "unknown"
  const positionId = getNumberValue(row, ["positionId", "PositionId"]) ?? "unknown"
  const openTimestamp = getStringValue(row, ["openTimestamp", "OpenTimestamp", "openDateTime", "OpenDateTime", "openDate", "OpenDate", "createdAt", "CreatedAt"]) ?? "unknown"
  const closeTimestamp = getStringValue(row, ["closeTimestamp", "CloseTimestamp", "closeDateTime", "CloseDateTime", "closeDate", "CloseDate", "lastUpdate", "LastUpdate", "closedAt", "ClosedAt", "updatedAt", "UpdatedAt"]) ?? "open"
  const openRate = getEtoroHistoryPrice(row, "open") ?? "unknown"
  const closeRate = getEtoroHistoryPrice(row, "close") ?? "open"
  return `${instrumentId}:${positionId}:${openTimestamp}:${closeTimestamp}:${openRate}:${closeRate}`
}

function mapEtoroSearchRowToInstrument(row: EtoroApiRow): BrokerInstrument | null {
  const instrumentId = getEtoroInstrumentId(row)
  if (instrumentId === null) {
    return null
  }

  const metadata = mapInstrumentMetadataRow(row)
  const rawTicker = getStringValue(row, [
    "internalSymbolFull",
    "InternalSymbolFull",
    "symbolFull",
    "SymbolFull",
    "ticker",
    "Ticker",
    "symbol",
    "Symbol",
    "displaySymbol",
    "DisplaySymbol",
  ]) ?? metadata?.ticker
  const companyName = getStringValue(row, [
    "instrumentDisplayName",
    "InstrumentDisplayName",
    "displayName",
    "DisplayName",
    "name",
    "Name",
    "companyName",
    "CompanyName",
  ]) ?? metadata?.companyName ?? rawTicker

  if (!rawTicker || !companyName) {
    return null
  }

  const currency = metadata?.currency ?? getEtoroCurrencyInfo(getStringValue(row, [
    "currency",
    "Currency",
    "currencyCode",
    "CurrencyCode",
    "priceCurrency",
    "PriceCurrency",
  ])).currency ?? "USD"
  const ticker = cleanEtoroTicker(rawTicker, metadata?.priceScale === "gbx" || currency === "GBP")

  return {
    broker: "etoro",
    id: String(instrumentId),
    ticker,
    companyName,
    nativeCurrency: currency,
    assetType: metadata?.assetType ?? mapMetadataAssetType(row, companyName) ?? inferAssetType(companyName),
    exchange: getStringValue(row, ["exchangeName", "ExchangeName", "exchange", "Exchange"]) ?? undefined,
    isQuoteAvailable: true,
  }
}

async function fetchEtoroJson<T>(baseUrl: string, path: string, headers: ReturnType<typeof buildEtoroHeaders>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      ...headers,
      "x-request-id": crypto.randomUUID(),
    },
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

  const encodedInstrumentIds = instrumentIds.join(",")
  const payload = await fetchEtoroJson<{ instrumentDisplayDatas?: unknown[] }>(
    baseUrl,
    `/api/v1/market-data/instruments?instrumentIds=${encodedInstrumentIds}`,
    headers
  )

  const metadata = new Map(
    (payload.instrumentDisplayDatas ?? [])
      .filter(isRecord)
      .map(mapInstrumentMetadataRow)
      .filter((entry): entry is EtoroInstrumentMetadata => Boolean(entry))
      .map((entry) => [entry.instrumentId, entry])
  )

  if (metadata.size < instrumentIds.length) {
    logger.warn({
      broker: "etoro",
      requestedInstrumentIds: instrumentIds,
      metadataCount: metadata.size,
    }, "eToro instrument metadata response did not include every requested instrument")
  }

  return metadata
}

async function fetchEtoroLiveRates(baseUrl: string, headers: ReturnType<typeof buildEtoroHeaders>, instrumentIds: number[]) {
  if (instrumentIds.length === 0) {
    return new Map<number, EtoroRateSnapshot>()
  }

  const payload = await fetchEtoroJson<{ rates?: unknown[] }>(
    baseUrl,
    `/api/v1/market-data/instruments/rates?instrumentIds=${instrumentIds.join(",")}`,
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

function getEtoroUnrealizedPlValue(row: EtoroApiRow) {
  for (const path of [
    "unrealizedPnL.pnL",
    "unrealizedPnL.PnL",
    "unrealizedPnL.pnl",
    "UnrealizedPnL.pnL",
    "UnrealizedPnL.PnL",
    "unrealizedPL.pnL",
    "UnrealizedPL.pnL",
  ]) {
    const value = getNestedValue(row, path)
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }

  return getNumberValue(row, [
    "netProfit",
    "NetProfit",
    "unrealizedPnL",
    "UnrealizedPnL",
    "unrealisedPnL",
    "UnrealisedPnL",
    "profit",
    "Profit",
    "pnl",
    "PnL",
  ])
}

function flattenClientPortfolioRows(clientPortfolio: unknown): EtoroApiRow[] {
  if (!isRecord(clientPortfolio)) {
    return []
  }

  const rows: EtoroApiRow[] = []
  const seen = new Set<EtoroApiRow>()

  const appendRows = (container: unknown) => {
    if (!isRecord(container)) return

    collectNestedRecords(container).forEach((row) => {
      if (seen.has(row)) return
      seen.add(row)
      rows.push(row)
    })
  }

  appendRows(clientPortfolio)

  for (const mirrorKey of ["mirrors", "Mirrors"]) {
    const mirrors = clientPortfolio[mirrorKey]
    if (!Array.isArray(mirrors)) continue

    mirrors.filter(isRecord).forEach((mirror) => appendRows(mirror))
  }

  return rows
}

function isPositionLikeRow(row: EtoroApiRow) {
  const hasInstrument = getEtoroInstrumentId(row) !== null || hasAnyValue(row, [
    "instrument.ticker",
    "instrument.symbol",
    "instrument.displaySymbol",
    "instrument.code",
    "symbolFull",
    "SymbolFull",
    "internalSymbolFull",
    "InternalSymbolFull",
    "instrumentDisplayName",
    "InstrumentDisplayName",
    "ticker",
    "symbol",
    "market.symbol",
    "InstrumentID",
    "InstrumentId",
    "instrumentId",
    "instrumentID",
    "positionID",
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

  return hasInstrument && hasSize
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

function hasKnownPositionContainer(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  if (ETORO_POSITION_CONTAINER_KEYS.some((key) => Array.isArray(value[key]))) {
    return true
  }

  return Object.values(value).some((nestedValue) => isRecord(nestedValue) && hasKnownPositionContainer(nestedValue))
}

function extractEtoroRows(payload: unknown): EtoroApiRow[] {
  const dedupeByPositionId = (rows: EtoroApiRow[]) => {
    const deduped: EtoroApiRow[] = []
    const seenPositionIds = new Set<number>()

    rows.forEach((row) => {
      const positionId = getNumberValue(row, ["positionID", "PositionID", "positionId", "PositionId"])
      if (positionId !== null) {
        if (seenPositionIds.has(positionId)) return
        seenPositionIds.add(positionId)
      }
      deduped.push(row)
    })

    return deduped
  }

  if (Array.isArray(payload)) {
    return dedupeByPositionId(payload.filter(isRecord))
  }

  if (!isRecord(payload)) {
    throw new Error("eToro returned an unexpected response format.")
  }

  const clientPortfolioRows = dedupeByPositionId(flattenClientPortfolioRows(payload.clientPortfolio))

  if (clientPortfolioRows.length > 0) {
    return clientPortfolioRows
  }

  const topLevelRows = dedupeByPositionId(flattenClientPortfolioRows(payload))

  if (topLevelRows.length > 0) {
    return topLevelRows
  }

  if (hasKnownPositionContainer(payload)) {
    return []
  }

  throw new Error("eToro returned an unexpected portfolio payload.")
}

function isExplicitNonLongPositionRow(row: EtoroApiRow) {
  return getBooleanValue(row, ["isBuy", "IsBuy", "direction", "Direction"]) === false
}

function getEtoroPositionExternalId(row: EtoroApiRow, normalizedTicker: string) {
  const positionId = getNumberValue(row, ["positionID", "PositionID", "positionId", "PositionId"])
  if (positionId !== null) {
    return `position:${positionId}`
  }

  const instrumentId = getEtoroInstrumentId(row)
  if (instrumentId !== null) {
    return `instrument:${instrumentId}`
  }

  return `ticker:${normalizedTicker}`
}

export function extractEtoroAccountSnapshot(payload: unknown): import("@/types/broker-account").BrokerAccountSnapshot | null {
  if (!isRecord(payload)) {
    return null
  }

  const clientPortfolio = isRecord(payload.clientPortfolio) ? payload.clientPortfolio : payload
  if (!isRecord(clientPortfolio)) {
    return null
  }

  const configuredCurrency = process.env.ETORO_ACCOUNT_CURRENCY?.trim().toUpperCase()
  const rawCurrency = getStringValue(clientPortfolio, ["currency", "Currency", "accountCurrency", "AccountCurrency"])
    ?? configuredCurrency
  const currency = rawCurrency === "GBP" ? "GBP" : "USD"
  const availableCash = getNumberValue(clientPortfolio, [
    "credit",
    "Credit",
    "availableCredit",
    "AvailableCredit",
    "balance",
    "Balance",
    "availableCash",
    "AvailableCash",
  ])
  const investedAmount = getNumberValue(clientPortfolio, [
    "totalInvested",
    "TotalInvested",
    "invested",
    "Invested",
    "investment",
    "Investment",
  ])
  const totalEquity = getNumberValue(clientPortfolio, [
    "equity",
    "Equity",
    "totalEquity",
    "TotalEquity",
    "accountEquity",
    "AccountEquity",
  ])
  const unrealizedPl = getNumberValue(clientPortfolio, [
    "unrealizedPnL",
    "unrealizedPnl",
    "UnrealizedPnL",
    "unrealizedProfit",
    "UnrealizedProfit",
  ])

  if (availableCash === null && investedAmount === null && totalEquity === null && unrealizedPl === null) {
    return null
  }

  return {
    broker: "etoro",
    currency,
    availableCash,
    investedAmount,
    totalEquity,
    holdingsValue: null,
    unrealizedPl,
  }
}

function mergeEtoroPositionRows(rowGroups: EtoroApiRow[][]): EtoroApiRow[] {
  const merged: EtoroApiRow[] = []
  const seenPositionIds = new Set<number>()

  rowGroups.forEach((rows) => {
    rows.forEach((row) => {
      const positionId = getNumberValue(row, ["positionID", "PositionID", "positionId", "PositionId"])
      if (positionId !== null) {
        if (seenPositionIds.has(positionId)) {
          return
        }
        seenPositionIds.add(positionId)
      }
      merged.push(row)
    })
  })

  return merged
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
    "symbolFull",
    "SymbolFull",
    "internalSymbolFull",
    "InternalSymbolFull",
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
    "investment",
    "Investment",
    "costBasis",
    "CostBasis",
    "position.costBasis",
    "totalCost",
    "TotalCost",
    "amount",
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
  const rateLivePrice = rateSnapshot?.livePrice === null || rateSnapshot?.livePrice === undefined
    ? null
    : normalizeEtoroPrice(rateSnapshot.livePrice, priceScale)
  const provisionalLivePrice = (rawLivePrice === null ? null : normalizeEtoroPrice(rawLivePrice, priceScale))
    ?? rateLivePrice
  const resolvedShares = shares
    ?? derivedShares
    ?? (provisionalLivePrice !== null && provisionalLivePrice > 0 && totalCost !== null
      ? (totalCost * leverage) / provisionalLivePrice
      : null)
  const resolvedAveragePrice = averagePrice
    ?? (resolvedShares && resolvedShares > 0 && totalCost !== null ? (totalCost * leverage) / resolvedShares : null)
  const livePrice = provisionalLivePrice
    ?? (resolvedShares && resolvedShares > 0 && currentValue !== null ? currentValue / resolvedShares : null)
    ?? resolvedAveragePrice
  const companyName = getStringValue(row, [
    "instrument.name",
    "instrument.Name",
    "instrumentDisplayName",
    "InstrumentDisplayName",
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
  const unrealizedPlNative = getEtoroUnrealizedPlValue(row)
  const nativeTotalValue = currentValue
    ?? (totalCost !== null && unrealizedPlNative !== null ? totalCost + unrealizedPlNative : null)
    ?? (resolvedShares && livePrice ? resolvedShares * livePrice : null)

  if (!ticker || resolvedShares === null || resolvedAveragePrice === null || livePrice === null || !currency || resolvedShares <= 0) {
    return null
  }

  const resolvedCompanyName = companyName ?? ticker
  const isLse = metadata?.priceScale === "gbx" || metadata?.currency === "GBP" || priceScale === "gbx"
  const cleanedTicker = cleanEtoroTicker(ticker, isLse)
  const externalPositionId = getEtoroPositionExternalId(row, cleanedTicker)
  const fxRateToGbp = currency === "GBP" ? 1 : undefined
  const totalPL = unrealizedPlNative === null
    ? undefined
    : currency === "GBP"
      ? unrealizedPlNative
      : unrealizedPlNative * (fxRateToGbp ?? USD_TO_GBP_FALLBACK_RATE)

  return normalizeImportedHolding({
    broker: "etoro",
    brokerLabel: "eToro",
    externalPositionId,
    ticker: cleanedTicker,
    companyName: resolvedCompanyName,
    shares: resolvedShares,
    avgPrice: resolvedAveragePrice,
    livePrice,
    nativeCurrency: currency,
    assetType: metadata?.assetType ?? normalizeEtoroAssetType(row, resolvedCompanyName),
    fxRateToGbp,
    nativeTotalValue: nativeTotalValue ?? undefined,
    totalPL,
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
    return [DEFAULT_ETORO_DEMO_PNL_PATH, DEFAULT_ETORO_DEMO_PORTFOLIO_PATH]
  }

  return [DEFAULT_ETORO_REAL_PNL_PATH, DEFAULT_ETORO_REAL_PORTFOLIO_PATH]
}

function buildEtoroHeaders(apiKey: string, apiSecret: string, requestId = crypto.randomUUID()) {
  return {
    Accept: "application/json",
    "x-request-id": requestId,
    "x-api-key": apiKey,
    "x-user-key": apiSecret,
  }
}

async function postEtoroJson<T>(baseUrl: string, path: string, headers: ReturnType<typeof buildEtoroHeaders>, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const responseText = await response.text()
  const parsedBody = responseText.trim() ? JSON.parse(responseText) as T : ({} as T)

  if (!response.ok) {
    const detail = responseText.trim()
      ? ` eToro responded with ${response.status}: ${responseText.trim().slice(0, 240)}`
      : ` eToro responded with ${response.status}.`

    throw new Error(`Failed to place eToro order.${detail}`)
  }

  return parsedBody
}

export function getEtoroOrderCapabilities(): OrderCapability {
  return {
    broker: "etoro",
    supportedOrderTypes: ["market", "limit"],
    supportsValueOrders: true,
    supportsStopLoss: true,
    supportsTakeProfit: true,
    supportsCancel: false,
  }
}

export function buildEtoroOrderPayload(order: TradeOrderRequest) {
  const instrumentId = Number(order.instrumentId)
  const payload: Record<string, string | number | boolean> = {
    InstrumentID: Number.isFinite(instrumentId) ? instrumentId : order.instrumentId,
    IsBuy: order.side === "buy",
    Leverage: order.leverage ?? 1,
  }

  if (order.inputMode === "value") {
    payload.Amount = order.value ?? 0
  } else {
    payload.AmountInUnits = order.quantity ?? 0
  }

  if (order.orderType === "limit" || order.orderType === "stop_limit") {
    payload.Rate = order.limitPrice ?? 0
  }
  if (order.stopLossPrice) {
    payload.StopLossRate = order.stopLossPrice
    payload.IsNoStopLoss = false
  } else {
    payload.IsNoStopLoss = true
  }
  if (order.takeProfitPrice) {
    payload.TakeProfitRate = order.takeProfitPrice
    payload.IsNoTakeProfit = false
  } else {
    payload.IsNoTakeProfit = true
  }

  return payload
}

export async function previewEtoroOrder(order: TradeOrderRequest, credentials?: string | BrokerApiCredentials) {
  const instrumentId = Number(order.instrumentId)
  const quote = Number.isFinite(instrumentId)
    ? await fetchEtoroInstrumentQuoteFromApi({ broker: "etoro", id: order.instrumentId, ticker: order.ticker, companyName: order.companyName ?? order.ticker, nativeCurrency: "USD", assetType: "stock", isQuoteAvailable: true }, credentials).catch(() => null)
    : null

  return buildOrderPreview(order, quote)
}

export async function placeEtoroOrder(order: TradeOrderRequest, credentials?: string | BrokerApiCredentials): Promise<BrokerOrderResult> {
  const { apiKey, apiSecret } = normalizeEtoroCredentials(credentials)
  const baseUrl = process.env.ETORO_API_BASE_URL?.trim() || DEFAULT_ETORO_API_BASE_URL
  const path = process.env.ETORO_ORDER_PATH?.trim() || DEFAULT_ETORO_REAL_ORDER_PATH
  const headers = buildEtoroHeaders(apiKey, apiSecret, order.idempotencyKey)
  const rawResponse = await postEtoroJson<EtoroApiRow>(baseUrl, path, headers, buildEtoroOrderPayload(order))
  const brokerOrderId = getStringValue(rawResponse, ["OrderID", "orderId", "PositionID", "positionId", "id"]) ?? null
  const jsonResponse = JSON.parse(JSON.stringify(rawResponse)) as Json

  return {
    brokerOrderId,
    status: "submitted",
    rawResponse: jsonResponse,
  }
}

function getEtoroOpenPositionTimestamp(row: EtoroApiRow) {
  return getStringValue(row, [
    "openTimestamp",
    "OpenTimestamp",
    "openDateTime",
    "OpenDateTime",
    "openDate",
    "OpenDate",
    "openedAt",
    "OpenedAt",
    "createdAt",
    "CreatedAt",
    "position.openTimestamp",
    "position.openDateTime",
    "position.openDate",
    "position.createdAt",
  ])
}

function createEtoroOpenPositionActivity(row: EtoroApiRow, position: PortfolioPosition): PortfolioActivityEvent | null {
  const timestamp = getEtoroOpenPositionTimestamp(row)
  if (!timestamp) return null

  const positionId = getNumberValue(row, ["positionId", "PositionId", "PositionID"])
    ?? getEtoroInstrumentId(row)
    ?? position.ticker
  const grossAmount = position.shares * position.avgPrice

  return {
    id: `etoro:${positionId}:open:${timestamp}:${position.avgPrice}`,
    timestamp,
    broker: "etoro",
    brokerLabel: "eToro",
    ticker: position.ticker,
    companyName: position.companyName,
    type: "buy",
    shares: position.shares,
    price: position.avgPrice,
    nativeCurrency: position.nativeCurrency,
    grossAmount,
    grossAmountGbp: grossAmount * position.fxRateToGbp,
    orderType: "Open",
  }
}

function mapEtoroRowsToPortfolioData(
  rows: EtoroApiRow[],
  metadataByInstrumentId: Map<number, EtoroInstrumentMetadata> = new Map(),
  ratesByInstrumentId: Map<number, EtoroRateSnapshot> = new Map()
) {
  const positions: PortfolioPosition[] = []
  const openActivity: PortfolioActivityEvent[] = []

  rows.forEach((row) => {
    const position = mapEtoroRowToPosition(row, metadataByInstrumentId, ratesByInstrumentId)
    if (!position) return

    positions.push(position)
    const activity = createEtoroOpenPositionActivity(row, position)
    if (activity) openActivity.push(activity)
  })

  return { positions, openActivity }
}

export function mapEtoroPortfolioResponse(payload: unknown): PortfolioPosition[] {
  const rows = extractEtoroRows(payload)
  const { positions } = mapEtoroRowsToPortfolioData(rows)

  if (rows.length > 0 && positions.length === 0) {
    if (rows.every(isExplicitNonLongPositionRow)) {
      return []
    }

    const sampleKeys = Object.keys(rows[0] ?? {}).slice(0, 12).join(", ") || "unknown"
    throw new Error(
      `eToro responded successfully, but none of the returned positions matched the portfolio fields this app currently supports. Sample row keys: ${sampleKeys}. If eToro changed its payload shape, update the live mapper or configure ETORO_PORTFOLIO_PATHS for the correct positions endpoint.`
    )
  }

  return positions
}

type EtoroPortfolioData = {
  positions: PortfolioPosition[]
  openActivity: PortfolioActivityEvent[]
  accountSnapshot: import("@/types/broker-account").BrokerAccountSnapshot | null
  rowsMapped: number
}

async function fetchEtoroPortfolioDataFromApi(credentials?: string | BrokerApiCredentials): Promise<EtoroPortfolioData> {
  const { apiKey, apiSecret } = normalizeEtoroCredentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("eToro requires both an API key and a user key before syncing.")
  }

  const baseUrl = process.env.ETORO_API_BASE_URL?.trim() || DEFAULT_ETORO_API_BASE_URL
  const attemptedResponses: string[] = []
  const headers = buildEtoroHeaders(apiKey, apiSecret)
  const rowGroups: EtoroApiRow[][] = []
  const payloads: unknown[] = []

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
    payloads.push(payload)
    const rows = extractEtoroRows(payload)
    if (rows.length > 0) {
      rowGroups.push(rows)
      logger.info({ broker: "etoro", path, rows: rows.length }, "Loaded eToro portfolio rows from endpoint")
    }
  }

  const mergedRows = mergeEtoroPositionRows(rowGroups)
  const accountSnapshot = payloads.map(extractEtoroAccountSnapshot).find(Boolean) ?? null
  const instrumentIds = Array.from(new Set(mergedRows.map(getEtoroInstrumentId).filter((value): value is number => value !== null)))

  logger.info({ broker: "etoro", rows: mergedRows.length, instrumentIds: instrumentIds.length }, "Loaded eToro portfolio rows")

  if (mergedRows.length === 0) {
    if (attemptedResponses.length > 0) {
      throw new Error(
        `Failed to load the eToro portfolio from the API. Tried: ${attemptedResponses.join("; ")}. The documented real-account path is ${DEFAULT_ETORO_REAL_PORTFOLIO_PATH} on ${baseUrl}; if your account uses demo mode or a different documented path, set ETORO_ACCOUNT_MODE or ETORO_PORTFOLIO_PATHS.`
      )
    }

    return { positions: [], openActivity: [], accountSnapshot, rowsMapped: 0 }
  }

  let metadataByInstrumentId = new Map<number, EtoroInstrumentMetadata>()
  let ratesByInstrumentId = new Map<number, EtoroRateSnapshot>()

  try {
    ;[metadataByInstrumentId, ratesByInstrumentId] = await Promise.all([
      fetchEtoroInstrumentMetadata(baseUrl, headers, instrumentIds),
      fetchEtoroLiveRates(baseUrl, headers, instrumentIds),
    ])
    logger.debug({ broker: "etoro", metadataCount: metadataByInstrumentId.size, rateCount: ratesByInstrumentId.size }, "eToro enrichment data loaded")
  } catch (error) {
    logger.warn(
      { broker: "etoro", error: getErrorLogDetails(error), instrumentIds: instrumentIds.length },
      "eToro portfolio enrichment failed; continuing with portfolio row fields only"
    )
  }

  const portfolioData = mapEtoroRowsToPortfolioData(mergedRows, metadataByInstrumentId, ratesByInstrumentId)
  const positions = portfolioData.positions

  logger.info({ broker: "etoro", positions: positions.length }, "Mapped eToro portfolio positions")

  if (positions.length > 0) {
    return {
      ...portfolioData,
      accountSnapshot,
      rowsMapped: mergedRows.length,
    }
  }

  if (mergedRows.every(isExplicitNonLongPositionRow)) {
    return { positions: [], openActivity: [], accountSnapshot, rowsMapped: mergedRows.length }
  }

  const sampleKeys = Object.keys(mergedRows[0] ?? {}).slice(0, 12).join(", ") || "unknown"
  throw new Error(
    `eToro responded successfully, but none of the returned positions matched the portfolio fields this app currently supports. Sample row keys: ${sampleKeys}. If eToro changed its payload shape, update the live mapper or configure ETORO_PORTFOLIO_PATHS for the correct positions endpoint.`
  )
}

export async function fetchEtoroPortfolioFromApi(credentials?: string | BrokerApiCredentials): Promise<PortfolioPosition[]> {
  const portfolioData = await fetchEtoroPortfolioDataFromApi(credentials)
  return portfolioData.positions
}

export async function fetchEtoroSyncDataFromApi(credentials?: string | BrokerApiCredentials) {
  const portfolioData = await fetchEtoroPortfolioDataFromApi(credentials)

  let historyActivity: PortfolioActivityEvent[] = []
  try {
    historyActivity = await fetchEtoroActivityFromApi(credentials)
  } catch (error) {
    logger.warn(
      { broker: "etoro", error: getErrorLogDetails(error) },
      "eToro trade history failed; continuing with portfolio positions only"
    )
  }

  const activityById = new Map<string, PortfolioActivityEvent>()

  historyActivity.forEach((event) => {
    activityById.set(event.id, event)
  })

  portfolioData.openActivity.forEach((event) => {
    if (!activityById.has(event.id)) {
      activityById.set(event.id, event)
    }
  })

  const activity = Array.from(activityById.values()).sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    )

  const holdingsValue = portfolioData.positions.reduce((sum, position) => sum + position.nativeTotalValue, 0)
  const accountSnapshot = portfolioData.accountSnapshot
    ? {
        ...portfolioData.accountSnapshot,
        holdingsValue: portfolioData.accountSnapshot.holdingsValue ?? holdingsValue,
      }
    : null

  return {
    positions: portfolioData.positions,
    activity,
    accountSnapshot,
    syncStats: {
      positionsMapped: portfolioData.rowsMapped,
      positionsStored: portfolioData.positions.length,
      activityImported: activity.length,
    },
  }
}

export async function searchEtoroInstrumentsFromApi(
  query: string,
  credentials?: string | BrokerApiCredentials
): Promise<BrokerInstrument[]> {
  const { apiKey, apiSecret } = normalizeEtoroCredentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("eToro requires both an API key and a user key before searching instruments.")
  }

  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 2) {
    return []
  }

  const baseUrl = process.env.ETORO_API_BASE_URL?.trim() || DEFAULT_ETORO_API_BASE_URL
  const headers = buildEtoroHeaders(apiKey, apiSecret)
  const path = `/api/v1/market-data/search?internalSymbolFull=${encodeURIComponent(normalizedQuery.toUpperCase())}`
  const payload = await fetchEtoroJson<EtoroSearchResponse>(baseUrl, path, headers)

  const instruments = extractEtoroSearchRows(payload)
    .map(mapEtoroSearchRowToInstrument)
    .filter((instrument): instrument is BrokerInstrument => Boolean(instrument))

  const rates = await fetchEtoroLiveRates(
    baseUrl,
    headers,
    instruments.map((instrument) => Number(instrument.id)).filter(Number.isFinite)
  )

  return instruments.map((instrument) => {
    const rate = rates.get(Number(instrument.id))
    return {
      ...instrument,
      livePrice: rate?.livePrice ?? undefined,
      isQuoteAvailable: Boolean(rate?.livePrice && rate.livePrice > 0),
    }
  }).slice(0, 12)
}

export async function fetchEtoroInstrumentQuoteFromApi(
  instrument: BrokerInstrument,
  credentials?: string | BrokerApiCredentials
): Promise<BrokerInstrumentQuote | null> {
  const { apiKey, apiSecret } = normalizeEtoroCredentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("eToro requires both an API key and a user key before loading instrument quotes.")
  }

  const instrumentId = Number(instrument.id)
  if (!Number.isFinite(instrumentId)) {
    return null
  }

  const baseUrl = process.env.ETORO_API_BASE_URL?.trim() || DEFAULT_ETORO_API_BASE_URL
  const headers = buildEtoroHeaders(apiKey, apiSecret)
  const rates = await fetchEtoroLiveRates(baseUrl, headers, [instrumentId])
  const rate = rates.get(instrumentId)

  if (!rate?.livePrice || rate.livePrice <= 0) {
    return null
  }

  return {
    broker: "etoro",
    id: instrument.id,
    ticker: instrument.ticker,
    companyName: instrument.companyName,
    livePrice: rate.livePrice,
    nativeCurrency: instrument.nativeCurrency,
  }
}

export async function fetchEtoroActivityFromApi(credentials?: string | BrokerApiCredentials): Promise<PortfolioActivityEvent[]> {
  const { apiKey, apiSecret } = normalizeEtoroCredentials(credentials)

  if (!apiKey || !apiSecret) {
    throw new Error("eToro requires both an API key and a user key before syncing history.")
  }

  const baseUrl = process.env.ETORO_API_BASE_URL?.trim() || DEFAULT_ETORO_API_BASE_URL
  const headers = buildEtoroHeaders(apiKey, apiSecret)
  const attemptedResponses: string[] = []
  const historyRows: EtoroTradeHistoryRow[] = []
  const historyRowKeys = new Set<string>()
  const loadedHistoryPaths: string[] = []

  for (const baseHistoryPath of getEtoroTradeHistoryPaths()) {
    for (const includeNames of [true, false]) {
      const rows: EtoroApiRow[] = []
      let page = 1
      let nextPath: string | null = buildEtoroHistoryPath(baseHistoryPath, page, includeNames)

      while (nextPath) {
        logger.info({ broker: "etoro", historyPath: nextPath, includeNames }, "Requesting eToro trade history")

        try {
          const payload = await fetchEtoroJson<EtoroHistoryResponse>(baseUrl, nextPath, headers)
          const pageRows = extractEtoroHistoryRows(payload)
          rows.push(...pageRows)

          const nextPagePath = getEtoroHistoryNextPath(payload)
          if (nextPagePath) {
            nextPath = nextPagePath
          } else {
            const nextPage = getEtoroHistoryNextPage(payload, page)
            page = nextPage ?? page
            nextPath = nextPage ? buildEtoroHistoryPath(baseHistoryPath, nextPage, includeNames) : null
          }
        } catch (error) {
          attemptedResponses.push(`${nextPath} -> ${error instanceof Error ? error.message : "Unknown error"}`)
          rows.length = 0
          break
        }
      }

      if (rows.length > 0) {
        rows.forEach((row) => {
          const key = getEtoroHistoryRowKey(row)
          if (historyRowKeys.has(key)) return
          historyRowKeys.add(key)
          historyRows.push(row as EtoroTradeHistoryRow)
        })
        loadedHistoryPaths.push(baseHistoryPath)
        break
      }
    }
  }

  if (loadedHistoryPaths.length === 0 && attemptedResponses.length > 0) {
    throw new Error(`Failed to load eToro trade history. Tried: ${attemptedResponses.join("; ")}`)
  }

  if (historyRows.length === 0) {
    throw new Error("eToro trade history returned no rows from the documented history endpoints.")
  }

  const instrumentIds = Array.from(new Set(historyRows
    .map((row) => getEtoroInstrumentId(row as unknown as EtoroApiRow))
    .filter((value): value is number => value !== null)))
  let metadataByInstrumentId: Map<number, EtoroInstrumentMetadata> = new Map()
  try {
    metadataByInstrumentId = await fetchEtoroInstrumentMetadata(baseUrl, headers, instrumentIds)
  } catch (error) {
    logger.warn({ broker: "etoro", error: getErrorLogDetails(error), instrumentIds: instrumentIds.length }, "eToro history metadata enrichment failed; continuing with instrument IDs")
  }

  // Also fetch live rates to help detect pence-priced instruments
  // If an instrument's live rate is >200 and metadata says "USD", it's almost certainly GBX
  let ratesByInstrumentId: Map<number, EtoroRateSnapshot> = new Map()
  try {
    ratesByInstrumentId = await fetchEtoroLiveRates(baseUrl, headers, instrumentIds)
  } catch {
    // Non-critical — just won't have rate-based pence detection
  }

  // Post-process metadata: only treat high live rates as pence when the instrument looks UK/LSE.
  for (const [id, metadata] of metadataByInstrumentId) {
    if (metadata.priceScale === "standard" && metadata.currency === "USD") {
      const rate = ratesByInstrumentId.get(id)
      const isLikelyLse = Boolean(
        metadata.ticker?.match(/\.(L|LSE|LON)$/i)
        || metadata.ticker?.match(/^[A-Z]+l$/)
      )

      if (isLikelyLse && rate?.livePrice && rate.livePrice > 200) {
        logger.info({ broker: "etoro", instrumentId: id, ticker: metadata.ticker, livePrice: rate.livePrice }, "Detected likely GBX instrument from live rate magnitude")
        metadata.currency = "GBP"
        metadata.priceScale = "gbx"
      }
    }
  }

  logger.info({ broker: "etoro", historyPaths: loadedHistoryPaths, historyRows: historyRows.length, historyInstrumentIds: instrumentIds.length }, "Loaded eToro trade history rows")

  const accountCurrency = inferEtoroAccountCurrency(historyRows, metadataByInstrumentId)
  logger.info({ broker: "etoro", accountCurrency }, "Resolved eToro account currency for trade history")

  const activity = historyRows.flatMap((row) => {
    const openEvent = createEtoroActivityEvent(row, "open", metadataByInstrumentId, accountCurrency)
    const closeEvent = createEtoroActivityEvent(row, "close", metadataByInstrumentId, accountCurrency)
    return [openEvent, closeEvent].filter((event): event is PortfolioActivityEvent => Boolean(event))
  })

  logger.info({ broker: "etoro", activityEvents: activity.length }, "Mapped eToro trade history into activity events")

  return activity
}

