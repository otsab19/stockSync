import type { PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"
import type { BrokerApiCredentials } from "@/types/integrations"
import type { BrokerAccountSnapshot, BrokerSyncStats } from "@/types/broker-account"
import type { BrokerOrderResult, OrderCapability, OrderPreview, TradeOrderRequest } from "@/types/orders"

export type BrokerInstrument = {
  broker: "t212" | "etoro"
  id: string
  ticker: string
  companyName: string
  nativeCurrency: "GBP" | "USD"
  assetType: "stock" | "etf" | "crypto"
  exchange?: string
  livePrice?: number
  isQuoteAvailable: boolean
}

export type BrokerInstrumentQuote = {
  broker: "t212" | "etoro"
  id: string
  ticker: string
  companyName: string
  livePrice: number
  nativeCurrency: "GBP" | "USD"
}

export type BrokerSyncResult = {
  positions: PortfolioPosition[]
  activity?: PortfolioActivityEvent[]
  accountSnapshot?: BrokerAccountSnapshot | null
  syncStats?: BrokerSyncStats
  message?: string
}

export interface BrokerProvider {
  id: string
  displayName: string
  supportsLiveApi: boolean
  supportsCsvImport: boolean
  getPositions(credentials?: string | BrokerApiCredentials): Promise<PortfolioPosition[]>
  getSyncData?(credentials?: string | BrokerApiCredentials): Promise<BrokerSyncResult>
  searchInstruments?(query: string, credentials?: string | BrokerApiCredentials): Promise<BrokerInstrument[]>
  getInstrumentQuote?(instrument: BrokerInstrument, credentials?: string | BrokerApiCredentials): Promise<BrokerInstrumentQuote | null>
  getOrderCapabilities?(): OrderCapability
  previewOrder?(order: TradeOrderRequest, credentials?: string | BrokerApiCredentials): Promise<OrderPreview>
  placeOrder?(order: TradeOrderRequest, credentials?: string | BrokerApiCredentials): Promise<BrokerOrderResult>
  cancelOrder?(brokerOrderId: string, credentials?: string | BrokerApiCredentials): Promise<BrokerOrderResult>
  importFromCsv?(csvText: string): Promise<PortfolioPosition[]>
}

