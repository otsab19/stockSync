import { getConfiguredBackend } from "@/lib/backend/config"
import { BrowserIndexedDbPortfolioRepository } from "@/lib/portfolio/browser-indexeddb"
import { HttpApiPortfolioRepository } from "@/lib/portfolio/http-api"
import type { ClientPortfolioRepository } from "@/lib/portfolio/repository"

export function createClientPortfolioRepository(): ClientPortfolioRepository {
  switch (getConfiguredBackend()) {
    case "browser":
      return new BrowserIndexedDbPortfolioRepository()
    case "supabase":
    default:
      return new HttpApiPortfolioRepository()
  }
}

