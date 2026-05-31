import type { BrokerProvider } from "@/lib/integrations/provider"
import { importEtoroPortfolioFromCsv } from "@/lib/integrations/etoro-csv"
import { fetchEtoroActivityFromApi, fetchEtoroPortfolioFromApi } from "@/lib/integrations/etoro-live"
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
    const positions = await this.getPositions(credentials)

    if (!(typeof credentials === "string" ? credentials.trim() : credentials?.apiKey?.trim())) {
      return { positions, activity: [] }
    }

    try {
      // Small delay to avoid rate limiting after positions fetch
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return {
        positions,
        activity: await fetchEtoroActivityFromApi(credentials),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const isRateLimit = message.includes("429") || message.toLowerCase().includes("too many requests")

      return {
        positions,
        activity: [],
        message: isRateLimit
          ? "eToro positions refreshed, but trade history hit the broker rate limit. Try refreshing history again in a minute."
          : `eToro positions refreshed, but trade history failed: ${message.slice(0, 150)}`,
      }
    }
  },
  async importFromCsv(csvText: string) {
    return importEtoroPortfolioFromCsv(csvText)
  },
}

