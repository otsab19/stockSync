import type { PortfolioApiResponse } from "@/types/portfolio"
import { replaceBrowserPortfolioInIndexedDb } from "@/lib/portfolio/browser-indexeddb"
import type { ClientPortfolioRepository } from "@/lib/portfolio/repository"

export class HttpApiPortfolioRepository implements ClientPortfolioRepository {
  async getPortfolio(): Promise<PortfolioApiResponse> {
    const response = await fetch("/api/portfolio", { cache: "no-store" })
    const data = (await response.json()) as PortfolioApiResponse

    if (data.status === "ok") {
      await replaceBrowserPortfolioInIndexedDb(data.portfolio, data.activity, data.meta ?? null)
      return data
    }

    if (data.status === "client_only") {
      return data
    }

    return {
      ...data,
      backend: data.backend,
      source: data.source,
    }
  }
}

