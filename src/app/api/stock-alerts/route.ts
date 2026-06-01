import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

type AlertDirection = "up" | "down" | "both"

type PositionRow = {
  broker: "t212" | "etoro"
  ticker: string
  company_name: string
  live_price: number | string
  native_currency: "GBP" | "USD"
}

type AlertRuleRow = {
  id: string
  broker: "t212" | "etoro"
  ticker: string
  company_name: string
  direction: AlertDirection
  threshold_percent: number | string
  baseline_price: number | string
  baseline_currency: "GBP" | "USD"
  is_enabled: boolean
  last_triggered_at: string | null
  last_triggered_price: number | string | null
  created_at: string
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeDirection(value: unknown): AlertDirection | null {
  return value === "up" || value === "down" || value === "both" ? value : null
}

async function getAuthenticatedClient() {
  const supabase = await createClient()
  if (!supabase) {
    return { error: NextResponse.json({ message: "Supabase not configured." }, { status: 503 }) }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) }
  }

  return { supabase, user }
}

export async function GET() {
  const auth = await getAuthenticatedClient()
  if (auth.error) return auth.error
  const { supabase, user } = auth

  const { data: positionRows, error: positionsError } = await supabase
    .from("positions")
    .select("broker, ticker, company_name, live_price, native_currency")
    .eq("user_id", user.id)
    .order("ticker") as unknown as { data: PositionRow[] | null; error: Error | null }

  if (positionsError) {
    return NextResponse.json({ message: "Failed to load synced positions." }, { status: 500 })
  }

  const { data: alertRows, error: alertsError } = await supabase
    .from("stock_alert_rules")
    .select("id, broker, ticker, company_name, direction, threshold_percent, baseline_price, baseline_currency, is_enabled, last_triggered_at, last_triggered_price, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false }) as unknown as { data: AlertRuleRow[] | null; error: Error | null }

  if (alertsError) {
    return NextResponse.json({ message: "Failed to load stock alerts." }, { status: 500 })
  }

  return NextResponse.json({
    positions: (positionRows ?? []).map((position) => ({
      ...position,
      live_price: toNumber(position.live_price),
    })),
    alerts: (alertRows ?? []).map((alert) => ({
      ...alert,
      threshold_percent: toNumber(alert.threshold_percent),
      baseline_price: toNumber(alert.baseline_price),
      last_triggered_price: alert.last_triggered_price === null ? null : toNumber(alert.last_triggered_price),
    })),
  })
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient()
  if (auth.error) return auth.error
  const { supabase, user } = auth

  const body = await request.json().catch(() => null) as {
    broker?: string
    ticker?: string
    direction?: string
    thresholdPercent?: number
  } | null

  const direction = normalizeDirection(body?.direction)
  const thresholdPercent = Number(body?.thresholdPercent ?? 1)

  if (!body?.broker || !body.ticker || !direction || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0) {
    return NextResponse.json({ message: "Choose a stock, direction, and positive threshold percent." }, { status: 400 })
  }

  const { data: position } = await supabase
    .from("positions")
    .select("broker, ticker, company_name, live_price, native_currency")
    .eq("user_id", user.id)
    .eq("broker", body.broker)
    .eq("ticker", body.ticker)
    .single() as unknown as { data: PositionRow | null }

  if (!position) {
    return NextResponse.json({ message: "Stock not found in synced positions. Sync your broker first." }, { status: 404 })
  }

  const baselinePrice = toNumber(position.live_price)
  if (baselinePrice <= 0) {
    return NextResponse.json({ message: "Stock has no valid live price yet." }, { status: 400 })
  }

  const { error } = await (supabase.from("stock_alert_rules") as unknown as {
    upsert(values: unknown, options?: unknown): PromiseLike<{ error: Error | null }>
  }).upsert(
    {
      user_id: user.id,
      broker: position.broker,
      ticker: position.ticker,
      company_name: position.company_name,
      direction,
      threshold_percent: thresholdPercent,
      baseline_price: baselinePrice,
      baseline_currency: position.native_currency,
      is_enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,broker,ticker,direction" }
  )

  if (error) {
    return NextResponse.json({ message: "Failed to save stock alert." }, { status: 500 })
  }

  return NextResponse.json({ message: "Stock alert saved." })
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedClient()
  if (auth.error) return auth.error
  const { supabase, user } = auth

  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) {
    return NextResponse.json({ message: "Alert id is required." }, { status: 400 })
  }

  const { error } = await supabase
    .from("stock_alert_rules")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ message: "Failed to delete stock alert." }, { status: 500 })
  }

  return NextResponse.json({ message: "Stock alert deleted." })
}
