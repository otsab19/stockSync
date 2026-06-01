import { createClient, getSupabaseSetupMessage } from "@/utils/supabase/server"
import type { PortfolioApiResponse, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"
import type { ServerPortfolioRepository } from "@/lib/portfolio/repository"
import { normalizeImportedHolding } from "@/lib/portfolio/position-normalizer"
import { createFailurePortfolioResponse, createSuccessPortfolioResponse } from "@/lib/dashboard/portfolio-response"

type PositionRow = {
  broker: "t212" | "etoro"
  ticker: string
  company_name: string
  shares: number | string
  avg_price: number | string
  live_price: number | string
  native_currency: "GBP" | "USD"
  fx_rate_to_gbp: number | string
  total_value_gbp: number | string
  total_pl: number | string
  total_pl_percent: number | string
  updated_at: string
}

type ActivityRow = {
  broker: "t212" | "etoro"
  ticker: string
  company_name: string
  event_type: "buy" | "sell"
  shares: number | string
  price: number | string
  native_currency: "GBP" | "USD"
  gross_amount_gbp: number | string
  realised_profit_gbp: number | string | null
  order_type: string | null
  timestamp: string
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getBrokerLabel(broker: "t212" | "etoro") {
  return broker === "t212" ? "Trading 212" : "eToro"
}

function mapPositionRow(row: PositionRow): PortfolioPosition {
  const fxRateToGbp = toNumber(row.fx_rate_to_gbp) || 1
  const totalValueGbp = toNumber(row.total_value_gbp)

  return normalizeImportedHolding({
    broker: row.broker,
    brokerLabel: getBrokerLabel(row.broker),
    ticker: row.ticker,
    companyName: row.company_name,
    shares: toNumber(row.shares),
    avgPrice: toNumber(row.avg_price),
    livePrice: toNumber(row.live_price),
    nativeCurrency: row.native_currency,
    fxRateToGbp,
    nativeTotalValue: fxRateToGbp === 0 ? totalValueGbp : totalValueGbp / fxRateToGbp,
    totalPL: toNumber(row.total_pl),
    totalPLPercent: toNumber(row.total_pl_percent),
  })
}

function mapActivityRow(row: ActivityRow): PortfolioActivityEvent {
  const grossAmountGbp = toNumber(row.gross_amount_gbp)
  const price = toNumber(row.price)
  const shares = toNumber(row.shares)

  return {
    id: `${row.broker}:${row.ticker}:${row.timestamp}:${row.event_type}`,
    timestamp: row.timestamp,
    broker: row.broker,
    brokerLabel: getBrokerLabel(row.broker),
    ticker: row.ticker,
    companyName: row.company_name,
    type: row.event_type,
    shares,
    price,
    nativeCurrency: row.native_currency,
    grossAmount: shares > 0 && price > 0 ? shares * price : grossAmountGbp,
    grossAmountGbp,
    realisedProfitGbp: row.realised_profit_gbp === null ? undefined : toNumber(row.realised_profit_gbp),
    orderType: row.order_type ?? undefined,
  }
}

export class SupabaseServerPortfolioRepository implements ServerPortfolioRepository {
  async getPortfolio(): Promise<PortfolioApiResponse> {
    const supabase = await createClient()

    if (!supabase) {
      return createFailurePortfolioResponse("setup_required", "supabase", "server", getSupabaseSetupMessage())
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return createFailurePortfolioResponse(
        "unauthorized",
        "supabase",
        "server",
        "Sign in with Supabase to load your portfolio data."
      )
    }

    const { data: positionRows, error: positionsError } = await supabase
      .from("positions")
      .select("broker, ticker, company_name, shares, avg_price, live_price, native_currency, fx_rate_to_gbp, total_value_gbp, total_pl, total_pl_percent, updated_at")
      .eq("user_id", user.id)
      .order("broker")
      .order("ticker") as unknown as { data: PositionRow[] | null; error: Error | null }

    if (positionsError) {
      return createFailurePortfolioResponse(
        "error",
        "supabase",
        "server",
        "Failed to load synced positions from Supabase."
      )
    }

    const { data: activityRows, error: activityError } = await supabase
      .from("activity_events")
      .select("broker, ticker, company_name, event_type, shares, price, native_currency, gross_amount_gbp, realised_profit_gbp, order_type, timestamp")
      .eq("user_id", user.id)
      .order("timestamp", { ascending: false }) as unknown as { data: ActivityRow[] | null; error: Error | null }

    if (activityError) {
      return createFailurePortfolioResponse(
        "error",
        "supabase",
        "server",
        "Failed to load synced activity from Supabase."
      )
    }

    const portfolio = (positionRows ?? []).map(mapPositionRow)
    const activity = (activityRows ?? []).map(mapActivityRow)
    const latestSyncedAt = (positionRows ?? [])
      .map((row) => row.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1)

    const message = portfolio.length === 0
      ? "No synced Supabase portfolio data yet. Sync a broker from the integrations page to populate the dashboard."
      : "Loaded synced portfolio data from Supabase."

    return createSuccessPortfolioResponse(
      portfolio,
      "supabase",
      "server",
      message,
      {
        sourceKind: "api_sync",
        lastSyncedAt: latestSyncedAt,
        syncMode: "scheduled",
      },
      activity
    )
  }
}
