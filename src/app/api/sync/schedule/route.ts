import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getConfiguredBackend } from "@/lib/backend/config"
import type { PortfolioSyncMode } from "@/types/portfolio"

type ScheduleBody = {
  broker?: "t212" | "etoro"
  syncMode?: PortfolioSyncMode
}

export async function PATCH(request: Request) {
  if (getConfiguredBackend() !== "supabase") {
    return NextResponse.json({ message: "Scheduled sync requires the Supabase backend." }, { status: 400 })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 })
  }

  const body = await request.json() as ScheduleBody
  if (!body.broker || (body.syncMode !== "manual" && body.syncMode !== "scheduled")) {
    return NextResponse.json({ message: "broker and syncMode are required." }, { status: 400 })
  }

  const now = new Date().toISOString()
  const writer = supabase as unknown as {
    from(table: string): {
      upsert(values: unknown, options?: unknown): PromiseLike<{ error: Error | null }>
    }
  }

  const { error } = await writer.from("broker_connections").upsert({
      user_id: user.id,
      broker: body.broker,
      source_type: "broker_api",
      sync_mode: body.syncMode,
      sync_status: "ready",
      is_enabled: true,
      updated_at: now,
    }, { onConflict: "user_id,broker,source_type" })

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 })
  }

  return NextResponse.json({
    broker: body.broker,
    syncMode: body.syncMode,
    message: body.syncMode === "scheduled"
      ? "Automatic portfolio sync enabled for this broker."
      : "Automatic portfolio sync disabled for this broker.",
  })
}
