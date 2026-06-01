import type { PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"
import type { BrokerApiCredentials } from "@/types/integrations"

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
  importFromCsv?(csvText: string): Promise<PortfolioPosition[]>
}

