import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getConfiguredBackend } from "@/lib/backend/config"
import type { PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"

type RecordSyncBody = {
  broker: string
  positions: PortfolioPosition[]
  activity?: PortfolioActivityEvent[]
}

export async function POST(request: Request) {
  if (getConfiguredBackend() !== "supabase") {
    return NextResponse.json({ message: "ok" })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Not signed in — silently skip (browser-only user)
    return NextResponse.json({ message: "ok" })
  }

  const body = await request.json() as RecordSyncBody
  const { broker, positions, activity } = body

  if (!broker || !positions) {
    return NextResponse.json({ message: "broker and positions required." }, { status: 400 })
  }

  // 1. Upsert broker_connection
  await (supabase.from("broker_connections") as any).upsert(
    {
      user_id: user.id,
      broker,
      source_type: "broker_api",
      sync_mode: "manual",
      sync_status: "succeeded",
      is_enabled: true,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,broker,source_type" }
  )

  // 2. Insert sync_run
  await (supabase.from("sync_runs") as any).insert({
    user_id: user.id,
    broker,
    trigger: "manual",
    source_type: "broker_api",
    status: "succeeded",
    positions_imported: positions.length,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  })

  // 3. Replace positions for this broker
  await (supabase.from("positions") as any).delete().eq("user_id", user.id).eq("broker", broker)

  if (positions.length > 0) {
    const positionRows = positions.map((p) => ({
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
      updated_at: new Date().toISOString(),
    }))
    await (supabase.from("positions") as any).insert(positionRows)
  }

  // 4. Upsert activity events for this broker
  if (activity && activity.length > 0) {
    // Delete existing activity for this broker, then insert fresh
    await (supabase.from("activity_events") as any).delete().eq("user_id", user.id).eq("broker", broker)

    const activityRows = activity.map((a) => ({
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

    // Insert in batches of 100
    for (let i = 0; i < activityRows.length; i += 100) {
      await (supabase.from("activity_events") as any).insert(activityRows.slice(i, i + 100))
    }
  }

  return NextResponse.json({ message: "Sync recorded.", positions: positions.length, activity: activity?.length ?? 0 })
}

