import { getConfiguredBackend } from "@/lib/backend/config"
import { SupabaseServerPortfolioRepository } from "@/lib/portfolio/server-supabase"
import { UnsupportedServerPortfolioRepository } from "@/lib/portfolio/server-unsupported"
import type { ServerPortfolioRepository } from "@/lib/portfolio/repository"

export function createServerPortfolioRepository(): ServerPortfolioRepository {
  switch (getConfiguredBackend()) {
    case "browser":
      return new UnsupportedServerPortfolioRepository()
    case "supabase":
    default:
      return new SupabaseServerPortfolioRepository()
  }
}

