import { NextResponse } from 'next/server';
import { getBrokerProvider } from '@/lib/integrations/factory';
import { createClient } from '@/utils/supabase/server';
import { getConfiguredBackend } from '@/lib/backend/config';
import { aggregatePositionsForStorage } from '@/lib/portfolio/position-normalizer';
import type { BrokerId, PortfolioActivityEvent, PortfolioApiResponse, PortfolioPosition } from '@/types/portfolio';
import { createServerPortfolioRepository } from '@/lib/portfolio/server-factory';

type DeleteBuilder = PromiseLike<{ error: Error | null }> & {
  eq(column: string, value: unknown): DeleteBuilder
  not(column: string, operator: string, value: string): DeleteBuilder
}

type TableWriter = {
  upsert(values: unknown, options?: unknown): PromiseLike<{ error: Error | null }>
  insert(values: unknown): PromiseLike<{ error: Error | null }>
  delete(): DeleteBuilder
}

type SupabaseWriter = {
  from(table: string): TableWriter
}

async function assertNoSupabaseError(error: Error | null, context: string) {
  if (error) {
    throw new Error(`${context}: ${error.message}`)
  }
}

type ProfileRow = {
  t212_api_key: string | null
  t212_api_secret: string | null
  etoro_api_key: string | null
  etoro_api_secret: string | null
}

async function recordBrokerSyncFailure(
  writer: SupabaseWriter,
  userId: string,
  broker: BrokerId,
  error: unknown
) {
  const now = new Date().toISOString()
  const message = error instanceof Error ? error.message : "Broker sync failed."

  await assertNoSupabaseError(
    (await writer.from("broker_connections").upsert(
    {
      user_id: userId,
      broker,
      source_type: "broker_api",
      sync_mode: "manual",
      sync_status: "failed",
      is_enabled: true,
      last_synced_at: now,
      last_error: message,
      updated_at: now,
    },
    { onConflict: "user_id,broker,source_type" }
  )).error,
    "Failed to record broker sync failure"
  )

  await assertNoSupabaseError(
    (await writer.from("sync_runs").insert({
    user_id: userId,
    broker,
    trigger: "manual",
    source_type: "broker_api",
    status: "failed",
    positions_imported: 0,
    started_at: now,
    finished_at: now,
    error_message: message,
  })).error,
    "Failed to record failed sync run"
  )
}

async function recordBrokerSync(
  writer: SupabaseWriter,
  userId: string,
  broker: BrokerId,
  positions: PortfolioPosition[],
  activity?: PortfolioActivityEvent[]
) {
  const now = new Date().toISOString()
  const storedPositions = aggregatePositionsForStorage(positions)

  await assertNoSupabaseError(
    (await writer.from("broker_connections").upsert(
    {
      user_id: userId,
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
  )).error,
    "Failed to record broker sync"
  )

  await assertNoSupabaseError(
    (await writer.from("sync_runs").insert({
    user_id: userId,
    broker,
    trigger: "manual",
    source_type: "broker_api",
    status: "succeeded",
    positions_imported: storedPositions.length,
    started_at: now,
    finished_at: now,
  })).error,
    "Failed to record sync run"
  )

  const positionRows = storedPositions.map((position) => ({
    user_id: userId,
    broker: position.broker,
    ticker: position.ticker,
    company_name: position.companyName,
    shares: position.shares,
    avg_price: position.avgPrice,
    live_price: position.livePrice,
    native_currency: position.nativeCurrency,
    fx_rate_to_gbp: position.fxRateToGbp,
    total_value_gbp: position.normalizedTotalValueGbp,
    total_pl: position.totalPL,
    total_pl_percent: position.totalPLPercent,
    updated_at: now,
  }))

  if (positionRows.length > 0) {
    await assertNoSupabaseError(
      (await writer.from("positions").upsert(positionRows, { onConflict: "user_id,broker,ticker" })).error,
      `Failed to store ${broker} positions`
    )

    const storedTickers = storedPositions.map((position) => position.ticker)
    await assertNoSupabaseError(
      (await writer.from("positions")
        .delete()
        .eq("user_id", userId)
        .eq("broker", broker)
        .not("ticker", "in", `(${storedTickers.join(",")})`)).error,
      `Failed to remove stale ${broker} positions`
    )
  } else {
    await assertNoSupabaseError(
      (await writer.from("positions").delete().eq("user_id", userId).eq("broker", broker)).error,
      "Failed to clear existing broker positions"
    )
  }

  if (activity) {
    if (activity.length > 0) {
      for (let index = 0; index < activity.length; index += 100) {
        await assertNoSupabaseError(
          (await writer.from("activity_events").upsert(
          activity.slice(index, index + 100).map((event) => ({
            user_id: userId,
            broker: event.broker,
            ticker: event.ticker,
            company_name: event.companyName,
            event_type: event.type,
            shares: event.shares,
            price: event.price,
            native_currency: event.nativeCurrency,
            gross_amount_gbp: event.grossAmountGbp,
            realised_profit_gbp: event.realisedProfitGbp ?? null,
            order_type: event.orderType ?? null,
            timestamp: event.timestamp,
          })),
          { onConflict: "user_id,broker,ticker,timestamp,event_type" }
        )).error,
          `Failed to store ${broker} activity`
        )
      }
    }
  }
}

async function refreshSupabaseBrokerData(includeActivity: boolean) {
  if (getConfiguredBackend() !== "supabase") return

  const supabase = await createClient()
  if (!supabase) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from("profiles")
    .select("t212_api_key, t212_api_secret, etoro_api_key, etoro_api_secret")
    .eq("id", user.id)
    .single() as unknown as { data: ProfileRow | null }

  const writer = supabase as unknown as SupabaseWriter

  for (const broker of ["t212", "etoro"] as const) {
    const apiKey = broker === "t212" ? profile?.t212_api_key : profile?.etoro_api_key
    const apiSecret = broker === "t212" ? profile?.t212_api_secret : profile?.etoro_api_secret
    if (!apiKey || !apiSecret) continue

    const provider = getBrokerProvider(broker)
    if (!provider) continue

    try {
      const syncData = includeActivity && provider.getSyncData
        ? await provider.getSyncData({ apiKey, apiSecret })
        : { positions: await provider.getPositions({ apiKey, apiSecret }), activity: undefined }

      await recordBrokerSync(writer, user.id, broker, syncData.positions, syncData.activity)
    } catch (error) {
      await recordBrokerSyncFailure(writer, user.id, broker, error)
    }
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get("refresh") === "true") {
    try {
      await refreshSupabaseBrokerData(url.searchParams.get("includeActivity") === "true")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh broker data."
      return NextResponse.json<PortfolioApiResponse>({
        status: "error",
        backend: "supabase",
        source: "server",
        portfolio: [],
        insights: null,
        message,
      }, { status: 500 })
    }
  }

  const repository = createServerPortfolioRepository()
  const response = await repository.getPortfolio()

  const statusCodeByResponse: Record<PortfolioApiResponse["status"], number> = {
    ok: 200,
    client_only: 200,
    setup_required: 503,
    unauthorized: 401,
    error: 500,
  }

  return NextResponse.json<PortfolioApiResponse>(response, {
    status: statusCodeByResponse[response.status],
  })
}
