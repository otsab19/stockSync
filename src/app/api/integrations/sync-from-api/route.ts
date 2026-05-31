import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { getBrokerProvider } from "@/lib/integrations/factory"
import { createRequestLogger, getErrorLogDetails } from "@/lib/backend/logger"
import { getConfiguredBackend } from "@/lib/backend/config"
import { createClient } from "@/utils/supabase/server"
import type { BrowserApiSyncRequest, BrowserApiSyncResponse } from "@/types/integrations"
import type { BrokerId, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"

function normalizeBrokerId(value: unknown): BrokerId | null {
  return typeof value === "string" && value.trim() ? (value.trim() as BrokerId) : null
}

export async function POST(request: Request) {
  const requestId = randomUUID()
  const requestLogger = createRequestLogger(requestId, { route: "/api/integrations/sync-from-api" })
  let payload: BrowserApiSyncRequest

  try {
    payload = (await request.json()) as BrowserApiSyncRequest
  } catch {
    requestLogger.warn("Received invalid JSON payload for broker sync")
    return NextResponse.json<BrowserApiSyncResponse>({
      status: "bad_request",
      message: "Send JSON with broker and apiKey fields.",
    }, { status: 400 })
  }

  const broker = normalizeBrokerId(payload?.broker)
  const apiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : ""
  const apiSecret = typeof payload?.apiSecret === "string" ? payload.apiSecret.trim() : ""
  const includeActivity = payload?.includeActivity === true

  requestLogger.info({ broker, hasApiKey: Boolean(apiKey), hasApiSecret: Boolean(apiSecret), includeActivity }, "Broker sync request received")

  if (!broker || !apiKey) {
    requestLogger.warn({ broker }, "Broker sync rejected because broker/apiKey were missing")
    return NextResponse.json<BrowserApiSyncResponse>({
      status: "bad_request",
      broker: broker ?? undefined,
      message: "Both broker and apiKey are required.",
    }, { status: 400 })
  }

  if ((broker === "t212" || broker === "etoro") && !apiSecret) {
    requestLogger.warn({ broker }, "Broker sync rejected because apiSecret was missing")
    return NextResponse.json<BrowserApiSyncResponse>({
      status: "bad_request",
      broker,
      message: broker === "etoro"
        ? "eToro requires both apiKey and apiSecret."
        : "Trading 212 requires both apiKey and apiSecret.",
    }, { status: 400 })
  }

  const provider = getBrokerProvider(broker)

  if (!provider || !provider.supportsLiveApi) {
    requestLogger.warn({ broker }, "Broker sync rejected because provider/live API is unavailable")
    return NextResponse.json<BrowserApiSyncResponse>({
      status: "unsupported",
      broker,
      message: `Direct API sync is not implemented for ${broker} in this build.`,
    }, { status: 501 })
  }

  try {
    requestLogger.info({ broker, includeActivity }, "Starting broker sync")
    const syncData = includeActivity && provider.getSyncData
      ? await provider.getSyncData({ apiKey, apiSecret })
      : { positions: await provider.getPositions({ apiKey, apiSecret }), activity: undefined }
    const portfolio = syncData.positions

    requestLogger.info({
      broker,
      positionsImported: portfolio.length,
      activityImported: syncData.activity?.length ?? 0,
    }, "Broker sync succeeded")

    // Record to Supabase if in supabase mode
    if (getConfiguredBackend() === "supabase") {
      recordSyncToSupabase(broker, portfolio, syncData.activity).catch(() => {})
    }

    return NextResponse.json<BrowserApiSyncResponse>({
      status: "ok",
      broker,
      portfolio,
      activity: syncData.activity,
      message: syncData.message ?? (
        portfolio.length === 0
          ? "The broker API call succeeded, but there are no open holdings right now."
          : `Fetched ${portfolio.length} holding${portfolio.length === 1 ? "" : "s"} from the broker API.`
      ),
    })
  } catch (error) {
    requestLogger.error({ broker, error: getErrorLogDetails(error) }, "Broker sync failed")
    return NextResponse.json<BrowserApiSyncResponse>({
      status: "error",
      broker,
      message: error instanceof Error ? `${error.message} [requestId=${requestId}]` : `Broker sync failed. [requestId=${requestId}]`,
    }, { status: 500 })
  }
}

async function recordSyncToSupabase(broker: BrokerId, positions: PortfolioPosition[], activity?: PortfolioActivityEvent[]) {
  const supabase = await createClient()
  if (!supabase) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const now = new Date().toISOString()

  // Upsert broker_connection
  await (supabase.from("broker_connections") as any).upsert(
    {
      user_id: user.id,
      broker,
      source_type: "broker_api",
      sync_mode: "manual",
      sync_status: "succeeded",
      is_enabled: true,
      last_synced_at: now,
      last_error: null,
      updated_at: now,
    },
    { onConflict: "user_id,broker,source_type" }
  )

  // Insert sync_run
  await (supabase.from("sync_runs") as any).insert({
    user_id: user.id,
    broker,
    trigger: "manual",
    source_type: "broker_api",
    status: "succeeded",
    positions_imported: positions.length,
    started_at: now,
    finished_at: now,
  })

  // Replace positions
  await (supabase.from("positions") as any).delete().eq("user_id", user.id).eq("broker", broker)
  if (positions.length > 0) {
    await (supabase.from("positions") as any).insert(
      positions.map((p) => ({
        user_id: user.id,
        broker: p.broker,
        ticker: p.ticker,
        company_name: p.companyName,
        shares: p.shares,
        avg_price: p.avgPrice,
        live_price: p.livePrice,
        native_currency: p.nativeCurrency,
        fx_rate_to_gbp: p.fxRateToGbp,
        total_value_gbp: p.normalizedTotalValueGbp,
        total_pl: p.totalPL,
        total_pl_percent: p.totalPLPercent,
        updated_at: now,
      }))
    )
  }

  // Replace activity
  if (activity && activity.length > 0) {
    await (supabase.from("activity_events") as any).delete().eq("user_id", user.id).eq("broker", broker)
    for (let i = 0; i < activity.length; i += 100) {
      await (supabase.from("activity_events") as any).insert(
        activity.slice(i, i + 100).map((a) => ({
          user_id: user.id,
          broker: a.broker,
          ticker: a.ticker,
          company_name: a.companyName,
          event_type: a.type,
          shares: a.shares,
          price: a.price,
          native_currency: a.nativeCurrency,
          gross_amount_gbp: a.grossAmountGbp,
          realised_profit_gbp: a.realisedProfitGbp ?? null,
          order_type: a.orderType ?? null,
          timestamp: a.timestamp,
        }))
      )
    }
  }
}

