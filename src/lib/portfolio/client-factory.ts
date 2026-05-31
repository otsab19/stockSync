import { BrowserIndexedDbPortfolioRepository } from "@/lib/portfolio/browser-indexeddb"
import type { ClientPortfolioRepository } from "@/lib/portfolio/repository"

export function createClientPortfolioRepository(): ClientPortfolioRepository {
  // Always use browser IndexedDB for client-side display.
  // Supabase mode adds server-side credential storage for cron/push,
  // but the dashboard always reads from local IndexedDB.
  return new BrowserIndexedDbPortfolioRepository()
}
