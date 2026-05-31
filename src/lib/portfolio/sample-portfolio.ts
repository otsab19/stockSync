import type { PortfolioPosition } from "@/types/portfolio"

const usdToGbp = 0.79

function createPosition(position: PortfolioPosition): PortfolioPosition {
  return position
}

const trading212SamplePortfolio: PortfolioPosition[] = [
  createPosition({
    id: "t212-vusa",
    ticker: "VUSA",
    companyName: "Vanguard S&P 500 UCITS ETF",
    broker: "t212",
    brokerLabel: "Trading 212",
    assetType: "etf",
    shares: 14.5,
    nativeCurrency: "GBP",
    avgPrice: 82.1,
    livePrice: 85.4,
    fxRateToGbp: 1,
    nativeTotalValue: 1238.3,
    normalizedTotalValueGbp: 1238.3,
    totalPL: 47.85,
    totalPLPercent: 4.03,
    alertDelta: 3.8,
    alertStatus: "stable",
    recentChange: 1.4,
  }),
  createPosition({
    id: "t212-vuag",
    ticker: "VUAG",
    companyName: "Vanguard S&P 500 Accumulating ETF",
    broker: "t212",
    brokerLabel: "Trading 212",
    assetType: "etf",
    shares: 8,
    nativeCurrency: "GBP",
    avgPrice: 91.2,
    livePrice: 91.8,
    fxRateToGbp: 1,
    nativeTotalValue: 734.4,
    normalizedTotalValueGbp: 734.4,
    totalPL: 4.8,
    totalPLPercent: 0.66,
    alertDelta: 21.3,
    alertStatus: "near-alert",
    recentChange: 0.4,
  }),
  createPosition({
    id: "t212-aapl",
    ticker: "AAPL",
    companyName: "Apple Inc.",
    broker: "t212",
    brokerLabel: "Trading 212",
    assetType: "stock",
    shares: 6,
    nativeCurrency: "GBP",
    avgPrice: 148,
    livePrice: 165.5,
    fxRateToGbp: 1,
    nativeTotalValue: 993,
    normalizedTotalValueGbp: 993,
    totalPL: 105,
    totalPLPercent: 11.82,
    alertDelta: 24.2,
    alertStatus: "triggered",
    recentChange: 3.1,
  }),
]

const etoroSamplePortfolio: PortfolioPosition[] = [
  createPosition({
    id: "etoro-tsla",
    ticker: "TSLA",
    companyName: "Tesla Inc.",
    broker: "etoro",
    brokerLabel: "eToro",
    assetType: "stock",
    shares: 3,
    nativeCurrency: "USD",
    avgPrice: 175,
    livePrice: 182.5,
    fxRateToGbp: usdToGbp,
    nativeTotalValue: 547.5,
    normalizedTotalValueGbp: 432.53,
    totalPL: 17.78,
    totalPLPercent: 4.29,
    alertDelta: 22.7,
    alertStatus: "near-alert",
    recentChange: -1.9,
  }),
  createPosition({
    id: "etoro-msft",
    ticker: "MSFT",
    companyName: "Microsoft Corporation",
    broker: "etoro",
    brokerLabel: "eToro",
    assetType: "stock",
    shares: 5,
    nativeCurrency: "USD",
    avgPrice: 310,
    livePrice: 324,
    fxRateToGbp: usdToGbp,
    nativeTotalValue: 1620,
    normalizedTotalValueGbp: 1279.8,
    totalPL: 55.3,
    totalPLPercent: 4.52,
    alertDelta: 6.1,
    alertStatus: "stable",
    recentChange: 2.6,
  }),
  createPosition({
    id: "etoro-btc",
    ticker: "BTC",
    companyName: "Bitcoin",
    broker: "etoro",
    brokerLabel: "eToro",
    assetType: "crypto",
    shares: 0.08,
    nativeCurrency: "USD",
    avgPrice: 62400,
    livePrice: 64950,
    fxRateToGbp: usdToGbp,
    nativeTotalValue: 5196,
    normalizedTotalValueGbp: 4104.84,
    totalPL: 161.16,
    totalPLPercent: 4.09,
    alertDelta: 12.8,
    alertStatus: "stable",
    recentChange: 5.4,
  }),
]

export function getTrading212SamplePortfolio() {
  return structuredClone(trading212SamplePortfolio)
}

export function getEtoroSamplePortfolio() {
  return structuredClone(etoroSamplePortfolio)
}

export function getBrowserModeSamplePortfolio() {
  return structuredClone([...trading212SamplePortfolio, ...etoroSamplePortfolio])
}

