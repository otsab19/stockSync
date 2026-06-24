import type { BrokerAccountSnapshot, BrokerSyncStats } from "@/types/broker-account"
import type { BrokerId, PortfolioActivityEvent, PortfolioPosition, PortfolioSyncMode } from "@/types/portfolio"

type DeleteBuilder = PromiseLike<{ error: Error | null }> & {
  eq(column: string, value: unknown): DeleteBuilder
  not(column: string, operator: string, value: string): DeleteBuilder
}

type TableWriter = {
  upsert(values: unknown, options?: unknown): PromiseLike<{ error: Error | null }>
  insert(values: unknown): PromiseLike<{ error: Error | null }>
  delete(): DeleteBuilder
}

export type SupabaseWriter = {
  from(table: string): TableWriter
}

export type RecordBrokerSyncOptions = {
  accountSnapshot?: BrokerAccountSnapshot | null
  syncStats?: BrokerSyncStats
  syncMode?: PortfolioSyncMode
  trigger?: "manual" | "scheduled"
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

export async function recordBrokerSyncFailure(
  writer: SupabaseWriter,
  userId: string,
  broker: BrokerId,
  error: unknown,
  options: Pick<RecordBrokerSyncOptions, "syncMode" | "trigger"> = {}
) {
  const now = new Date().toISOString()
  const message = error instanceof Error ? error.message : "Broker sync failed."

  await assertNoSupabaseError(
    (await writer.from("broker_connections").upsert(
    {
      user_id: userId,
      broker,
      source_type: "broker_api",
      sync_mode: options.syncMode ?? "manual",
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
    trigger: options.trigger ?? "manual",
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

export async function recordBrokerSync(
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
      sync_mode: options.syncMode ?? "manual",
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
    trigger: options.trigger ?? "manual",
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
