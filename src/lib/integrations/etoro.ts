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

    return {
      positions,
      activity: await fetchEtoroActivityFromApi(credentials),
    }
  },
  async importFromCsv(csvText: string) {
    return importEtoroPortfolioFromCsv(csvText)
  },
}

