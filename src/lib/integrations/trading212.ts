import type { BrokerProvider } from "@/lib/integrations/provider"
import { importTrading212PortfolioFromCsv } from "@/lib/integrations/trading212-csv"
import {
  fetchTrading212PortfolioFromApi,
  fetchTrading212SyncDataFromApi,
  getTrading212OrderCapabilities,
  mapTrading212AccountSummary,
  placeTrading212Order,
  previewTrading212Order,
  searchTrading212InstrumentsFromApi,
} from "@/lib/integrations/trading212-live"
import { getTrading212SamplePortfolio } from "@/lib/portfolio/sample-portfolio"

function isTrading212RateLimitError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes(" 429") || message.includes("too many requests") || message.includes('"type":"toomanyrequests"')
}

export const trading212Provider: BrokerProvider = {
  id: "t212",
  displayName: "Trading 212",
  supportsLiveApi: true,
  supportsCsvImport: true,
  async getPositions(credentials) {
    if (typeof credentials === "string" ? credentials.trim() : credentials?.apiKey?.trim()) {
      return fetchTrading212PortfolioFromApi(credentials)
    }

    return getTrading212SamplePortfolio()
  },
  async getSyncData(credentials) {
    const positions = await this.getPositions(credentials)

    if (!(typeof credentials === "string" ? credentials.trim() : credentials?.apiKey?.trim())) {
      return { positions, activity: [] }
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return await fetchTrading212SyncDataFromApi(credentials)
    } catch (error) {
      if (isTrading212RateLimitError(error)) {
        throw new Error("Trading 212 positions refreshed, but trade history hit the broker rate limit. Try refreshing activity again in a minute.")
      }

      throw error
    }
  },
  async searchInstruments(query, credentials) {
    return searchTrading212InstrumentsFromApi(query, credentials)
  },
  getOrderCapabilities() {
    return getTrading212OrderCapabilities()
  },
  async previewOrder(order) {
    return previewTrading212Order(order)
  },
  async placeOrder(order, credentials) {
    return placeTrading212Order(order, credentials)
  },
  async importFromCsv(csvText: string) {
    return importTrading212PortfolioFromCsv(csvText)
  },
}

