import { getAlertDelta, getAlertStatus } from "@/lib/alerts/thresholds"
import type { AssetType, BrokerId, PortfolioPosition } from "@/types/portfolio"

const USD_TO_GBP_FALLBACK_RATE = 0.79

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
  recentChange?: number
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
  recentChange = 0,
}: ImportedHoldingInput): PortfolioPosition {
  const safeShares = Number(shares)
  const safeAveragePrice = Number(avgPrice)
  const safeLivePrice = Number(livePrice ?? avgPrice)
  const rateToGbp = fxRateToGbp ?? (nativeCurrency === "GBP" ? 1 : USD_TO_GBP_FALLBACK_RATE)
  const nativeTotalValue = safeShares * safeLivePrice
  const normalizedTotalValueGbp = nativeTotalValue * rateToGbp
  const totalPlNative = (safeLivePrice - safeAveragePrice) * safeShares
  const totalPL = totalPlNative * rateToGbp
  const totalCostBasisNative = Math.max(safeAveragePrice * safeShares, 0.000001)
  const totalPLPercent = (totalPlNative / totalCostBasisNative) * 100

  return {
    id: `${broker}-${ticker.trim().toLowerCase()}`,
    ticker: ticker.trim().toUpperCase(),
    companyName: companyName.trim() || ticker.trim().toUpperCase(),
    broker,
    brokerLabel,
    assetType,
    shares: safeShares,
    nativeCurrency,
    avgPrice: safeAveragePrice,
    livePrice: safeLivePrice,
    fxRateToGbp: rateToGbp,
    nativeTotalValue,
    normalizedTotalValueGbp,
    totalPL,
    totalPLPercent,
    alertDelta: getAlertDelta(totalPL),
    alertStatus: getAlertStatus(totalPL),
    recentChange,
  }
}

