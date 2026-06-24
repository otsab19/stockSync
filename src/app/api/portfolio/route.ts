import { NextResponse } from 'next/server';
import { getBrokerProvider } from '@/lib/integrations/factory';
import { createClient } from '@/utils/supabase/server';
import { getConfiguredBackend } from '@/lib/backend/config';
import type { BrokerAccountSnapshot, BrokerSyncStats } from '@/types/broker-account';
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

type RecordBrokerSyncOptions = {
  accountSnapshot?: BrokerAccountSnapshot | null
  syncStats?: BrokerSyncStats
}

async function assertNoSupabaseError(error: Error | null, context: string) {
  if (error) {
    throw new Error(`${context}: ${error.message}`)
  }
}

function resolveAccountSnapshot(
  positions: PortfolioPosition[],
  accountSnapshot?: BrokerAccountSnapshot | null
): BrokerAccountSnapshot | null {
  if (!accountSnapshot) {
    return null
  }

  const holdingsValue = positions.reduce((sum, position) => sum + position.nativeTotalValue, 0)

  return {
    ...accountSnapshot,
    holdingsValue: accountSnapshot.holdingsValue ?? holdingsValue,
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
    positions_mapped: 0,
    activity_imported: 0,
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
  activity?: PortfolioActivityEvent[],
  options: RecordBrokerSyncOptions = {}
) {
  const now = new Date().toISOString()
  const accountSnapshot = resolveAccountSnapshot(positions, options.accountSnapshot)
  const positionsMapped = options.syncStats?.positionsMapped ?? positions.length
  const positionsStored = positions.length
  const activityImported = options.syncStats?.activityImported ?? activity?.length ?? 0

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
      account_currency: accountSnapshot?.currency ?? null,
      available_cash: accountSnapshot?.availableCash ?? null,
      invested_amount: accountSnapshot?.investedAmount ?? null,
      total_equity: accountSnapshot?.totalEquity ?? null,
      holdings_value: accountSnapshot?.holdingsValue ?? null,
      unrealized_pl: accountSnapshot?.unrealizedPl ?? null,
      realized_pl: accountSnapshot?.realizedPl ?? null,
      last_positions_mapped: positionsMapped,
      last_positions_stored: positionsStored,
      last_activity_imported: activityImported,
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
    positions_imported: positionsStored,
    positions_mapped: positionsMapped,
    activity_imported: activityImported,
    started_at: now,
    finished_at: now,
  })).error,
    "Failed to record sync run"
  )

  const positionRows = positions.map((position) => ({
    user_id: userId,
    broker: position.broker,
    external_position_id: position.externalPositionId,
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
      (await writer.from("positions").upsert(positionRows, { onConflict: "user_id,broker,external_position_id" })).error,
      `Failed to store ${broker} positions`
    )

    const storedExternalIds = positions.map((position) => `"${position.externalPositionId.replaceAll('"', '\\"')}"`)
    await assertNoSupabaseError(
      (await writer.from("positions")
        .delete()
        .eq("user_id", userId)
        .eq("broker", broker)
        .not("external_position_id", "in", `(${storedExternalIds.join(",")})`)).error,
      `Failed to remove stale ${broker} positions`
    )
  } else {
    await assertNoSupabaseError(
      (await writer.from("positions").delete().eq("user_id", userId).eq("broker", broker)).error,
      "Failed to clear existing broker positions"
    )
  }

  if (activity && activity.length > 0) {
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

      await recordBrokerSync(writer, user.id, broker, syncData.positions, syncData.activity, {
        accountSnapshot: syncData.accountSnapshot ?? null,
        syncStats: syncData.syncStats ?? {
          positionsMapped: syncData.positions.length,
          positionsStored: syncData.positions.length,
          activityImported: syncData.activity?.length ?? 0,
        },
      })
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
