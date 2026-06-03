import { createClient, getSupabaseSetupMessage } from "@/utils/supabase/server"
import { calculateFreshness } from "@/lib/dashboard/freshness"
import type { PortfolioApiResponse, PortfolioActivityEvent, PortfolioDataMeta, PortfolioPosition } from "@/types/portfolio"
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

type BrokerConnectionRow = {
  broker: "t212" | "etoro"
  source_type: "manual_csv" | "broker_api"
  sync_mode: "manual" | "scheduled"
  sync_status: "never_synced" | "ready" | "running" | "succeeded" | "failed"
  is_enabled: boolean
  last_synced_at: string | null
  last_error: string | null
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getBrokerLabel(broker: "t212" | "etoro") {
  return broker === "t212" ? "Trading 212" : "eToro"
}

function buildPortfolioMeta(
  positionRows: PositionRow[],
  connectionRows: BrokerConnectionRow[]
): PortfolioDataMeta {
  const staleAfterMinutes = 60
  const positionUpdatedByBroker = new Map<string, string>()

  positionRows.forEach((row) => {
    const current = positionUpdatedByBroker.get(row.broker)
    if (!current || row.updated_at > current) {
      positionUpdatedByBroker.set(row.broker, row.updated_at)
    }
  })

  const brokerDetails = connectionRows.map((connection) => {
    const lastSyncedAt = connection.last_synced_at ?? positionUpdatedByBroker.get(connection.broker)
    const freshness = calculateFreshness(lastSyncedAt, "server", staleAfterMinutes, Boolean(connection.last_error))

    return {
      broker: connection.broker,
      sourceKind: connection.source_type === "broker_api" ? "api_sync" as const : "csv_import" as const,
      lastSyncedAt,
      syncMode: connection.sync_mode,
      syncStatus: connection.sync_status,
      freshness,
      lastError: connection.last_error,
    }
  })

  const latestSyncedAt = [
    ...positionRows.map((row) => row.updated_at),
    ...connectionRows.map((row) => row.last_synced_at).filter(Boolean),
  ].sort().at(-1)
  const lastError = connectionRows.find((row) => row.last_error)?.last_error ?? null

  return {
    sourceKind: "api_sync",
    lastSyncedAt: latestSyncedAt ?? undefined,
    syncMode: connectionRows.some((row) => row.sync_mode === "scheduled") ? "scheduled" : "manual",
    staleAfterMinutes,
    freshness: calculateFreshness(latestSyncedAt, "server", staleAfterMinutes, Boolean(lastError)),
    lastError,
    brokerDetails,
  }
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

    const [positionsResponse, connectionsResponse] = await Promise.all([
      supabase
        .from("positions")
        .select("broker, ticker, company_name, shares, avg_price, live_price, native_currency, fx_rate_to_gbp, total_value_gbp, total_pl, total_pl_percent, updated_at")
        .eq("user_id", user.id)
        .order("broker")
        .order("ticker"),
      supabase
        .from("broker_connections")
        .select("broker, source_type, sync_mode, sync_status, is_enabled, last_synced_at, last_error")
        .eq("user_id", user.id)
        .eq("is_enabled", true),
    ]) as unknown as [
      { data: PositionRow[] | null; error: Error | null },
      { data: BrokerConnectionRow[] | null; error: Error | null },
    ]

    const { data: positionRows, error: positionsError } = positionsResponse

    if (positionsError) {
      return createFailurePortfolioResponse(
        "error",
        "supabase",
        "server",
        "Failed to load synced positions from Supabase."
      )
    }

    const connectionRows = connectionsResponse.error ? [] : (connectionsResponse.data ?? [])

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
    const meta = buildPortfolioMeta(positionRows ?? [], connectionRows)

    const message = portfolio.length === 0
      ? "No synced Supabase portfolio data yet. Sync a broker from the integrations page to populate the dashboard."
      : "Loaded synced portfolio data from Supabase."

    return createSuccessPortfolioResponse(
      portfolio,
      "supabase",
      "server",
      message,
      meta,
      activity
    )
  }
}
