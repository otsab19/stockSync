import type { BrokerAccountSnapshot, BrokerSyncStats } from "@/types/broker-account"
import type { BrokerId, PortfolioActivityEvent, PortfolioPosition, PortfolioSyncMode } from "@/types/portfolio"
import { logger, getErrorLogDetails } from "@/lib/backend/logger"
import { normalizePortfolioPositions } from "@/lib/portfolio/position-normalizer"

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
  preserveSyncMode?: boolean
}

async function assertNoSupabaseError(error: Error | null, context: string) {
  if (error) {
    throw new Error(`${context}: ${error.message}`)
  }
}

function isMissingColumnError(error: Error | null) {
  const message = error?.message?.toLowerCase() ?? ""
  return message.includes("column") || message.includes("schema cache")
}

async function upsertBrokerConnection(
  writer: SupabaseWriter,
  payload: Record<string, unknown>,
  legacyPayload: Record<string, unknown>,
  context: string
) {
  const phase1Result = await writer.from("broker_connections").upsert(payload, { onConflict: "user_id,broker,source_type" })

  if (!phase1Result.error) {
    return
  }

  if (!isMissingColumnError(phase1Result.error)) {
    await assertNoSupabaseError(phase1Result.error, context)
    return
  }

  await assertNoSupabaseError(
    (await writer.from("broker_connections").upsert(legacyPayload, { onConflict: "user_id,broker,source_type" })).error,
    context
  )
}

async function insertSyncRun(
  writer: SupabaseWriter,
  payload: Record<string, unknown>,
  legacyPayload: Record<string, unknown>,
  context: string
) {
  const phase1Result = await writer.from("sync_runs").insert(payload)

  if (!phase1Result.error) {
    return
  }

  if (!isMissingColumnError(phase1Result.error)) {
    await assertNoSupabaseError(phase1Result.error, context)
    return
  }

  await assertNoSupabaseError(
    (await writer.from("sync_runs").insert(legacyPayload)).error,
    context
  )
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

function accountSnapshotIndicatesHoldings(accountSnapshot: BrokerAccountSnapshot | null) {
  if (!accountSnapshot) {
    return false
  }

  return (accountSnapshot.investedAmount ?? 0) > 0
    || (accountSnapshot.holdingsValue ?? 0) > 0
    || Math.abs(accountSnapshot.unrealizedPl ?? 0) > 0
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

  await upsertBrokerConnection(
    writer,
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
    "Failed to record broker sync failure"
  )

  await insertSyncRun(
    writer,
    {
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
    },
    {
      user_id: userId,
      broker,
      trigger: options.trigger ?? "manual",
      source_type: "broker_api",
      status: "failed",
      positions_imported: 0,
      started_at: now,
      finished_at: now,
      error_message: message,
    },
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
  const normalizedPositions = normalizePortfolioPositions(positions)
  const accountSnapshot = resolveAccountSnapshot(normalizedPositions, options.accountSnapshot)
  const positionsMapped = options.syncStats?.positionsMapped ?? normalizedPositions.length
  const positionsStored = normalizedPositions.length
  const activityImported = options.syncStats?.activityImported ?? activity?.length ?? 0
  const brokerLabel = broker === "etoro" ? "eToro" : "Trading 212"
  const accountIndicatesHoldings = accountSnapshotIndicatesHoldings(accountSnapshot)
  const preserveStoredHoldings = positionsStored === 0 && accountIndicatesHoldings
  const emptySyncWarning = positionsStored === 0
    ? preserveStoredHoldings
      ? `${brokerLabel} reports invested capital but no open positions were parsed. Existing holdings were preserved.`
      : `${brokerLabel} returned no open positions during sync. Existing holdings were preserved.`
    : null

  const connectionPayload: Record<string, unknown> = {
    user_id: userId,
    broker,
    source_type: "broker_api",
    sync_status: positionsStored === 0 ? "failed" : "succeeded",
    is_enabled: true,
    last_synced_at: now,
    last_error: emptySyncWarning,
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
  }

  const legacyConnectionPayload: Record<string, unknown> = {
    user_id: userId,
    broker,
    source_type: "broker_api",
    sync_status: positionsStored === 0 ? "failed" : "succeeded",
    is_enabled: true,
    last_synced_at: now,
    last_error: emptySyncWarning,
    updated_at: now,
  }

  if (!options.preserveSyncMode) {
    connectionPayload.sync_mode = options.syncMode ?? "manual"
    legacyConnectionPayload.sync_mode = options.syncMode ?? "manual"
  }

  await upsertBrokerConnection(writer, connectionPayload, legacyConnectionPayload, "Failed to record broker sync")

  await insertSyncRun(
    writer,
    {
      user_id: userId,
      broker,
      trigger: options.trigger ?? "manual",
      source_type: "broker_api",
      status: positionsStored === 0 ? "failed" : "succeeded",
      positions_imported: positionsStored,
      positions_mapped: positionsMapped,
      activity_imported: activityImported,
      started_at: now,
      finished_at: now,
      error_message: emptySyncWarning,
    },
    {
      user_id: userId,
      broker,
      trigger: options.trigger ?? "manual",
      source_type: "broker_api",
      status: positionsStored === 0 ? "failed" : "succeeded",
      positions_imported: positionsStored,
      started_at: now,
      finished_at: now,
      error_message: emptySyncWarning,
    },
    "Failed to record sync run"
  )

  const positionRows = normalizedPositions.map((position) => ({
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

    const storedExternalIds = normalizedPositions.map((position) => `"${position.externalPositionId.replaceAll('"', '\\"')}"`)
    await assertNoSupabaseError(
      (await writer.from("positions")
        .delete()
        .eq("user_id", userId)
        .eq("broker", broker)
        .not("external_position_id", "in", `(${storedExternalIds.join(",")})`)).error,
      `Failed to remove stale ${broker} positions`
    )
  } else {
    logger.warn(
      { broker, userId, positionsMapped, positionsStored, accountIndicatesHoldings },
      "Broker sync returned no positions; preserving existing stored holdings"
    )
  }

  if (activity && activity.length > 0) {
    try {
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
    } catch (error) {
      logger.warn(
        { broker, userId, error: getErrorLogDetails(error), activityCount: activity.length },
        "Broker positions were stored, but activity import failed"
      )
    }
  }
}
