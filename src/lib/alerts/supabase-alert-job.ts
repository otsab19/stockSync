import webpush from "web-push"
import type { AlertJobRepository } from "@/lib/alerts/repository"
import type { AlertJobResult } from "@/types/alerts"
import { createClient, getSupabaseSetupMessage } from "@/utils/supabase/server"

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!publicKey || !privateKey) {
    return {
      ok: false as const,
      message: "Web push is not configured. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env.local.",
    }
  }

  webpush.setVapidDetails("mailto:your-email@example.com", publicKey, privateKey)

  return { ok: true as const }
}

export class SupabaseAlertJobRepository implements AlertJobRepository {
  async runAlertCheck(): Promise<AlertJobResult> {
    const supabase = await createClient()

    if (!supabase) {
      return {
        success: false,
        backend: "supabase",
        error: "Setup required",
        message: getSupabaseSetupMessage(),
      }
    }

    const webPushConfig = configureWebPush()

    if (!webPushConfig.ok) {
      return {
        success: false,
        backend: "supabase",
        error: "Setup required",
        message: webPushConfig.message,
      }
    }

    const { error: connectionError } = await supabase.from("portfolio_snapshots").select("id").limit(1)

    if (connectionError) {
      return {
        success: false,
        backend: "supabase",
        error: "Database not ready",
        message: "The alert job could not read the portfolio_snapshots table. Create the expected Supabase tables first.",
      }
    }

    return {
      success: true,
      backend: "supabase",
      message: "Alert checks are scaffolded. Database connectivity and VAPID configuration are now positioned for a server-backed ±£25 notification pipeline.",
    }
  }
}

