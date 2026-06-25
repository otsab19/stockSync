import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getConfiguredBackend } from "@/lib/backend/config"
import { recordBrokerSync, type SupabaseWriter } from "@/lib/sync/record-broker-sync"
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
    return NextResponse.json({ message: "ok" })
  }

  const body = await request.json() as RecordSyncBody
  const { broker, positions, activity } = body

  if (!broker || !positions) {
    return NextResponse.json({ message: "broker and positions required." }, { status: 400 })
  }

  const writer = supabase as unknown as SupabaseWriter

  try {
    await recordBrokerSync(writer, user.id, broker, positions, activity, {
      syncMode: "manual",
      trigger: "manual",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record sync."
    return NextResponse.json({ message }, { status: 500 })
  }

  return NextResponse.json({ message: "Sync recorded.", positions: positions.length, activity: activity?.length ?? 0 })
}
