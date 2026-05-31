export type BrokerId = "t212" | "etoro" | (string & {})
export type AssetType = "stock" | "etf" | "crypto"
export type AlertStatus = "stable" | "near-alert" | "triggered"
export type CurrencyMode = "native" | "normalized_gbp"
export type PortfolioActivityType = "buy" | "sell"

export type PortfolioPosition = {
  id: string
  ticker: string
  companyName: string
  broker: BrokerId
  brokerLabel: string
  assetType: AssetType
  shares: number
  nativeCurrency: "GBP" | "USD"
  avgPrice: number
  livePrice: number
  fxRateToGbp: number
  nativeTotalValue: number
  normalizedTotalValueGbp: number
  totalPL: number
  totalPLPercent: number
  alertDelta: number
  alertStatus: AlertStatus
  recentChange: number
}

export type PortfolioBackend = "supabase" | "browser"
export type PortfolioSource = "server" | "browser_local"
export type PortfolioDataSourceKind = "sample" | "csv_import" | "api_sync"
export type PortfolioSyncMode = "manual" | "scheduled"

export type PortfolioDataMeta = {
  sourceKind: PortfolioDataSourceKind
  broker?: BrokerId
  fileName?: string
  lastSyncedAt?: string
  syncMode?: PortfolioSyncMode
  brokerDetails?: Array<{
    broker: BrokerId
    sourceKind: PortfolioDataSourceKind
    fileName?: string
    lastSyncedAt?: string
    syncMode?: PortfolioSyncMode
  }>
}

export type PortfolioActivityEvent = {
  id: string
  timestamp: string
  broker: BrokerId
  brokerLabel: string
  ticker: string
  companyName: string
  type: PortfolioActivityType
  shares: number
  price: number
  nativeCurrency: "GBP" | "USD"
  grossAmount: number
  grossAmountGbp: number
  realisedProfitGbp?: number
  orderType?: string
}

export type PortfolioHistoryPoint = {
  timestamp: string
  portfolioValueGbp: number
  totalPlGbp: number
  buyValueGbp: number
  sellValueGbp: number
  netInvestedGbp: number
  tradeCount: number
}

export type BrokerAllocation = {
  broker: BrokerId
  brokerLabel: string
  valueGbp: number
  percentage: number
}

export type AssetAllocation = {
  label: string
  valueGbp: number
  percentage: number
}

export type PortfolioInsights = {
  totalPortfolioValueGbp: number
  totalNetReturnGbp: number
  totalNetReturnPercent: number
  activeAlertStates: number
  brokerDistribution: BrokerAllocation[]
  assetAllocation: AssetAllocation[]
  history: PortfolioHistoryPoint[]
  activity: PortfolioActivityEvent[]
}

export type PortfolioApiSuccess = {
  status: "ok"
  portfolio: PortfolioPosition[]
  insights: PortfolioInsights
  activity?: PortfolioActivityEvent[]
  backend: PortfolioBackend
  source: PortfolioSource
  meta?: PortfolioDataMeta | null
  message?: string
}

export type PortfolioApiClientOnly = {
  status: "client_only"
  portfolio: []
  insights: null
  backend: "browser"
  source: "server"
  meta?: PortfolioDataMeta | null
  message: string
}

export type PortfolioApiFailure = {
  status: "setup_required" | "unauthorized" | "error"
  portfolio: []
  insights: null
  backend: PortfolioBackend
  source: PortfolioSource
  meta?: PortfolioDataMeta | null
  message: string
}

export type PortfolioApiResponse = PortfolioApiSuccess | PortfolioApiClientOnly | PortfolioApiFailure
