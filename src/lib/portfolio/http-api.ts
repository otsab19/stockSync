import type { PortfolioApiResponse } from "@/types/portfolio"
import { createSuccessPortfolioResponse } from "@/lib/dashboard/portfolio-response"
import { normalizePortfolioPositions } from "@/lib/portfolio/position-normalizer"
import { loadBrowserPortfolioFromIndexedDb, replaceBrowserPortfolioInIndexedDb } from "@/lib/portfolio/browser-indexeddb"
import type { ClientPortfolioRepository, ClientPortfolioRequestOptions } from "@/lib/portfolio/repository"

export class HttpApiPortfolioRepository implements ClientPortfolioRepository {
  async getPortfolio(options: ClientPortfolioRequestOptions = {}): Promise<PortfolioApiResponse> {
    if (!options.refresh && options.preferCache) {
      try {
        const cached = await loadBrowserPortfolioFromIndexedDb()
        if (cached.positions.length > 0 || cached.activity.length > 0) {
          return createSuccessPortfolioResponse(
            normalizePortfolioPositions(cached.positions),
            "supabase",
            "browser_local",
            "Using cached portfolio data from this browser. Click Refresh to sync the latest trades from your brokers.",
            cached.metadata ?? null,
            cached.activity
          )
        }
      } catch {
        // Fall back to server when IndexedDB is unavailable or empty.
      }
    }

    const params = new URLSearchParams()
    if (options.refresh) params.set("refresh", "true")
    if (options.includeActivity) params.set("includeActivity", "true")

    const response = await fetch(`/api/portfolio${params.size > 0 ? `?${params.toString()}` : ""}`, { cache: "no-store" })
    const data = (await response.json()) as PortfolioApiResponse

    if (data.status === "ok") {
      const portfolio = normalizePortfolioPositions(data.portfolio)
      await replaceBrowserPortfolioInIndexedDb(portfolio, data.activity, data.meta ?? null)
      return { ...data, portfolio }
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

