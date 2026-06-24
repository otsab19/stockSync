import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getConfiguredBackend } from "@/lib/backend/config"
import { runScheduledPortfolioSync } from "@/lib/sync/scheduled-portfolio-sync"

export async function GET(request: Request) {
  if (getConfiguredBackend() !== "supabase") {
    return NextResponse.json({ message: "Scheduled sync requires the Supabase backend." }, { status: 400 })
  }

  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCronAuth) {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const result = await runScheduledPortfolioSync()
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
