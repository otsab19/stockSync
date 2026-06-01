import { getAlertDelta, getAlertStatus } from "@/lib/alerts/thresholds"
import type { AssetType, BrokerId, PortfolioPosition } from "@/types/portfolio"

const USD_TO_GBP_FALLBACK_RATE = 0.79

const TICKER_ALIASES: Record<string, string> = {
  GIG: "BBAI", // BigBear.ai was renamed from GigCapital4.
}

export type ImportedHoldingInput = {
  broker: BrokerId
  brokerLabel: string
  ticker: string
  companyName: string
  shares: number
  avgPrice: number
  livePrice?: number
  nativeCurrency: "GBP" | "USD"
  assetType?: AssetType
  fxRateToGbp?: number
  nativeTotalValue?: number
  totalPL?: number
  totalPLPercent?: number
  recentChange?: number
}

export function normalizeTickerSymbol(ticker: string, options: { isLseListed?: boolean } = {}) {
  let cleaned = ticker
    .trim()
    .replace(/(?:_US_EQ|_GB_EQ|p_EQ|_EQ)$/i, "")
    .replace(/\.(?:L|LSE|LON)$/i, "")

  if (
    cleaned.length > 1
    && cleaned.endsWith("l")
    && (options.isLseListed || /^[A-Z]+l$/.test(cleaned))
  ) {
    cleaned = cleaned.slice(0, -1)
  }

  const upper = cleaned.toUpperCase()
  return TICKER_ALIASES[upper] ?? upper
}

export function inferAssetType(label: string, fallback: AssetType = "stock"): AssetType {
  const normalized = label.trim().toLowerCase()

  if (!normalized) {
    return fallback
  }

  if (normalized.includes("crypto") || normalized.includes("bitcoin") || normalized.includes("ethereum")) {
    return "crypto"
  }

  if (normalized.includes("etf") || normalized.includes("fund")) {
    return "etf"
  }

  return fallback
}

export function normalizeImportedHolding({
  broker,
  brokerLabel,
  ticker,
  companyName,
  shares,
  avgPrice,
  livePrice,
  nativeCurrency,
  assetType = inferAssetType(companyName),
  fxRateToGbp,
  nativeTotalValue,
  totalPL,
  totalPLPercent,
  recentChange = 0,
}: ImportedHoldingInput): PortfolioPosition {
  const normalizedTicker = normalizeTickerSymbol(ticker)
  const safeShares = Number(shares)
  const safeAveragePrice = Number(avgPrice)
  const safeLivePrice = Number(livePrice ?? avgPrice)
  const rateToGbp = fxRateToGbp ?? (nativeCurrency === "GBP" ? 1 : USD_TO_GBP_FALLBACK_RATE)
  const resolvedNativeTotalValue = nativeTotalValue ?? safeShares * safeLivePrice
  const normalizedTotalValueGbp = resolvedNativeTotalValue * rateToGbp
  const totalPlNative = totalPL === undefined ? (safeLivePrice - safeAveragePrice) * safeShares : totalPL / rateToGbp
  const resolvedTotalPL = totalPL ?? totalPlNative * rateToGbp
  const totalCostBasisNative = Math.max(safeAveragePrice * safeShares, 0.000001)
  const resolvedTotalPLPercent = totalPLPercent ?? (totalPlNative / totalCostBasisNative) * 100

  return {
    id: `${broker}-${normalizedTicker.toLowerCase()}`,
    ticker: normalizedTicker,
    companyName: companyName.trim() || normalizedTicker,
    broker,
    brokerLabel,
    assetType,
    shares: safeShares,
    nativeCurrency,
    avgPrice: safeAveragePrice,
    livePrice: safeLivePrice,
    fxRateToGbp: rateToGbp,
    nativeTotalValue: resolvedNativeTotalValue,
    normalizedTotalValueGbp,
    totalPL: resolvedTotalPL,
    totalPLPercent: resolvedTotalPLPercent,
    alertDelta: getAlertDelta(resolvedTotalPL),
    alertStatus: getAlertStatus(resolvedTotalPL),
    recentChange,
  }
}

