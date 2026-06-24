import type { BrokerProvider } from "@/lib/integrations/provider"
import { importEtoroPortfolioFromCsv } from "@/lib/integrations/etoro-csv"
import {
  cancelEtoroOrder,
  closeEtoroPositionByMarket,
  fetchEtoroCandlesFromApi,
  fetchEtoroInstrumentQuoteFromApi,
  fetchEtoroPendingOrdersFromApi,
  fetchEtoroPortfolioFromApi,
  fetchEtoroSyncDataFromApi,
  getEtoroOrderCapabilities,
  placeEtoroOrder,
  previewEtoroOrder,
  searchEtoroInstrumentsFromApi,
} from "@/lib/integrations/etoro-live"
import { getEtoroSamplePortfolio } from "@/lib/portfolio/sample-portfolio"

export const etoroProvider: BrokerProvider = {
  id: "etoro",
  displayName: "eToro",
  supportsLiveApi: true,
  supportsCsvImport: true,
  async getPositions(credentials) {
    if (typeof credentials === "string" ? credentials.trim() : credentials?.apiKey?.trim()) {
      return fetchEtoroPortfolioFromApi(credentials)
    }

    return getEtoroSamplePortfolio()
  },
  async getSyncData(credentials) {
    if (!(typeof credentials === "string" ? credentials.trim() : credentials?.apiKey?.trim())) {
      const positions = await this.getPositions(credentials)
      return { positions, activity: [] }
    }

    try {
      // Small delay to avoid rate limiting after nearby broker calls.
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return fetchEtoroSyncDataFromApi(credentials)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const isRateLimit = message.includes("429") || message.toLowerCase().includes("too many requests")

      throw new Error(isRateLimit
        ? "eToro positions refreshed, but trade history hit the broker rate limit. Try refreshing activity again in a minute."
        : `eToro positions refreshed, but trade history failed: ${message.slice(0, 150)}`)
    }
  },
  async searchInstruments(query, credentials) {
    return searchEtoroInstrumentsFromApi(query, credentials)
  },
  async getInstrumentQuote(instrument, credentials) {
    return fetchEtoroInstrumentQuoteFromApi(instrument, credentials)
  },
  getOrderCapabilities() {
    return getEtoroOrderCapabilities()
  },
  async previewOrder(order, credentials) {
    return previewEtoroOrder(order, credentials)
  },
  async placeOrder(order, credentials) {
    return placeEtoroOrder(order, credentials)
  },
  async cancelOrder(brokerOrderId, credentials, options) {
    return cancelEtoroOrder(brokerOrderId, credentials, options)
  },
  async getPendingOrders(credentials) {
    return fetchEtoroPendingOrdersFromApi(credentials)
  },
  async closePosition(request, credentials) {
    return closeEtoroPositionByMarket(request, credentials)
  },
  async getInstrumentCandles(instrumentId, options, credentials) {
    return fetchEtoroCandlesFromApi(instrumentId, options, credentials)
  },
  async importFromCsv(csvText: string) {
    return importEtoroPortfolioFromCsv(csvText)
  },
}

