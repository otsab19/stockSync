import type { PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"
import type { BrokerApiCredentials } from "@/types/integrations"

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
  importFromCsv?(csvText: string): Promise<PortfolioPosition[]>
}

