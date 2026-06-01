import type { PortfolioApiResponse } from "@/types/portfolio"
import { replaceBrowserPortfolioInIndexedDb } from "@/lib/portfolio/browser-indexeddb"
import type { ClientPortfolioRepository, ClientPortfolioRequestOptions } from "@/lib/portfolio/repository"

export class HttpApiPortfolioRepository implements ClientPortfolioRepository {
  async getPortfolio(options: ClientPortfolioRequestOptions = {}): Promise<PortfolioApiResponse> {
    const params = new URLSearchParams()
    if (options.refresh) params.set("refresh", "true")
    if (options.includeActivity) params.set("includeActivity", "true")

    const response = await fetch(`/api/portfolio${params.size > 0 ? `?${params.toString()}` : ""}`, { cache: "no-store" })
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

