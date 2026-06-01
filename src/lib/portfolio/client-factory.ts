import { BrowserIndexedDbPortfolioRepository } from "@/lib/portfolio/browser-indexeddb"
import { isSupabaseBackend } from "@/lib/backend/config"
import { HttpApiPortfolioRepository } from "@/lib/portfolio/http-api"
import type { ClientPortfolioRepository } from "@/lib/portfolio/repository"

export function createClientPortfolioRepository(): ClientPortfolioRepository {
  if (isSupabaseBackend()) {
    return new HttpApiPortfolioRepository()
  }

  return new BrowserIndexedDbPortfolioRepository()
}
