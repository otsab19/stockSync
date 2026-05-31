import type { PortfolioActivityEvent, PortfolioApiResponse, PortfolioApiSuccess, PortfolioDataMeta, PortfolioPosition } from "@/types/portfolio"
import { buildInsights } from "@/lib/dashboard/filter-engine"

const buildPortfolioInsights = buildInsights as (
  portfolio: PortfolioPosition[],
  activity?: PortfolioActivityEvent[]
) => PortfolioApiSuccess["insights"]

export function createSuccessPortfolioResponse(
  portfolio: PortfolioPosition[],
  backend: "supabase" | "browser",
  source: "server" | "browser_local",
  message?: string,
  meta?: PortfolioDataMeta | null,
  activity: PortfolioActivityEvent[] = []
): PortfolioApiResponse {
  return {
    status: "ok",
    portfolio,
    insights: buildPortfolioInsights(portfolio, activity),
    activity,
    backend,
    source,
    meta,
    message,
  }
}

export function createFailurePortfolioResponse(
  status: "setup_required" | "unauthorized" | "error",
  backend: "supabase" | "browser",
  source: "server" | "browser_local",
  message: string,
  meta?: PortfolioDataMeta | null
): PortfolioApiResponse {
  return {
    status,
    portfolio: [],
    insights: null,
    backend,
    source,
    meta,
    message,
  }
}

