import type { BrokerId, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"

export type BrokerApiCredentials = {
  apiKey: string
  apiSecret?: string
}

export type BrowserApiSyncRequest = {
  broker: BrokerId
  apiKey: string
  apiSecret?: string
  includeActivity?: boolean
}

export type BrowserApiSyncSuccess = {
  status: "ok"
  broker: BrokerId
  portfolio: PortfolioPosition[]
  activity?: PortfolioActivityEvent[]
  message?: string
}

export type BrowserApiSyncFailure = {
  status: "bad_request" | "unsupported" | "error"
  broker?: BrokerId
  message: string
}

export type BrowserApiSyncResponse = BrowserApiSyncSuccess | BrowserApiSyncFailure

