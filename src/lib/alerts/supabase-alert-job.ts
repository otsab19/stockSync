import webpush from "web-push"
import type { AlertJobRepository } from "@/lib/alerts/repository"
import type { AlertJobResult } from "@/types/alerts"
import { createServiceRoleClient, getSupabaseServiceRoleSetupMessage } from "@/utils/supabase/server"
import { getBrokerProvider } from "@/lib/integrations/factory"
import { PROFIT_ALERT_THRESHOLD_GBP } from "@/lib/alerts/thresholds"
import type { PortfolioPosition } from "@/types/portfolio"

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!publicKey || !privateKey) {
    return {
      ok: false as const,
      message: "Web push is not configured. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env.local.",
    }
  }

  webpush.setVapidDetails("mailto:alerts@stocksync.app", publicKey, privateKey)

  return { ok: true as const }
}

type SnapshotRow = {
  id: string
  user_id: string
  ticker: string
  broker: string
  current_pl_gbp: number
  last_alerted_pl: number
}

type DeleteBuilder = PromiseLike<unknown> & {
  eq(column: string, value: unknown): DeleteBuilder
}

type TableWriter = {
  upsert(values: unknown, options?: unknown): PromiseLike<unknown>
  insert(values: unknown): PromiseLike<unknown>
  delete(): DeleteBuilder
}

type SupabaseWriter = {
  from(table: string): TableWriter
}

async function recordScheduledPositions(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
  broker: "t212" | "etoro",
  positions: PortfolioPosition[]
) {
  const now = new Date().toISOString()
  const writer = supabase as unknown as SupabaseWriter

  await writer.from("broker_connections").upsert(
    {
      user_id: userId,
      broker,
      source_type: "broker_api",
      sync_mode: "scheduled",
      sync_status: "succeeded",
      is_enabled: true,
      last_synced_at: now,
      last_error: null,
      updated_at: now,
    },
    { onConflict: "user_id,broker,source_type" }
  )

  await writer.from("sync_runs").insert({
    user_id: userId,
    broker,
    trigger: "scheduled",
    source_type: "broker_api",
    status: "succeeded",
    positions_imported: positions.length,
    started_at: now,
    finished_at: now,
  })

  await writer.from("positions").delete().eq("user_id", userId).eq("broker", broker)

  if (positions.length > 0) {
    await writer.from("positions").insert(
      positions.map((position) => ({
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
    )
  }
}

export class SupabaseAlertJobRepository implements AlertJobRepository {
  async runAlertCheck(): Promise<AlertJobResult> {
    const supabase = createServiceRoleClient()

    if (!supabase) {
      return {
        success: false,
        backend: "supabase",
        error: "Setup required",
        message: getSupabaseServiceRoleSetupMessage(),
      }
    }

    const webPushConfig = configureWebPush()
    const writer = supabase as unknown as SupabaseWriter

    if (!webPushConfig.ok) {
      return {
        success: false,
        backend: "supabase",
        error: "Setup required",
        message: webPushConfig.message,
      }
    }

    // Get all users with API keys
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, t212_api_key, t212_api_secret, etoro_api_key, etoro_api_secret") as unknown as {
        data: Array<{ id: string; t212_api_key: string | null; t212_api_secret: string | null; etoro_api_key: string | null; etoro_api_secret: string | null }> | null
        error: Error | null
      }

    if (profilesError || !profiles) {
      return {
        success: false,
        backend: "supabase",
        error: "Database error",
        message: "Could not read profiles table.",
      }
    }

    let alertsSent = 0
    let usersChecked = 0
    const syncErrors: string[] = []

    for (const profile of profiles) {
      const positions: PortfolioPosition[] = []

      if (profile.t212_api_key) {
        const provider = getBrokerProvider("t212")
        if (provider) {
          try {
            const pos = await provider.getPositions({
              apiKey: profile.t212_api_key,
              apiSecret: profile.t212_api_secret ?? "",
            })
            await recordScheduledPositions(supabase, profile.id, "t212", pos)
            positions.push(...pos)
          } catch (error) {
            syncErrors.push(`Trading 212 sync failed for ${profile.id}: ${error instanceof Error ? error.message : "Unknown error"}`)
          }
        }
      }

      if (profile.etoro_api_key) {
        const provider = getBrokerProvider("etoro")
        if (provider) {
          try {
            const pos = await provider.getPositions({
              apiKey: profile.etoro_api_key,
              apiSecret: profile.etoro_api_secret ?? "",
            })
            await recordScheduledPositions(supabase, profile.id, "etoro", pos)
            positions.push(...pos)
          } catch (error) {
            syncErrors.push(`eToro sync failed for ${profile.id}: ${error instanceof Error ? error.message : "Unknown error"}`)
          }
        }
      }

      if (positions.length === 0) continue
      usersChecked++

      // Get existing snapshots for this user
      const { data: snapshots } = await supabase
        .from("portfolio_snapshots")
        .select("id, user_id, ticker, broker, current_pl_gbp, last_alerted_pl")
        .eq("user_id", profile.id) as unknown as { data: SnapshotRow[] | null }

      const snapshotMap = new Map<string, SnapshotRow>(
        (snapshots ?? []).map((s) => [`${s.ticker}:${s.broker}`, s as unknown as SnapshotRow])
      )

      const triggeredAlerts: Array<{ ticker: string; broker: string; pl: number; direction: string }> = []

      for (const pos of positions) {
        const key = `${pos.ticker}:${pos.broker}`
        const existing = snapshotMap.get(key)
        const absPL = Math.abs(pos.totalPL)

        if (absPL >= PROFIT_ALERT_THRESHOLD_GBP) {
          const lastAlerted = existing?.last_alerted_pl ?? 0
          // Only alert if P&L crossed a new threshold multiple since last alert
          const currentBucket = Math.floor(absPL / PROFIT_ALERT_THRESHOLD_GBP)
          const lastBucket = Math.floor(Math.abs(lastAlerted) / PROFIT_ALERT_THRESHOLD_GBP)

          if (currentBucket > lastBucket) {
            const direction = pos.totalPL > 0 ? "profit" : "loss"
            triggeredAlerts.push({ ticker: pos.ticker, broker: pos.broker, pl: pos.totalPL, direction })

            // Update last_alerted_pl
            await writer.from("portfolio_snapshots").upsert(
              {
                user_id: profile.id,
                ticker: pos.ticker,
                broker: pos.broker,
                current_pl_gbp: pos.totalPL,
                last_alerted_pl: pos.totalPL,
              },
              { onConflict: "user_id,ticker,broker" }
            )
          } else {
            // Update current PL but don't re-alert
            await writer.from("portfolio_snapshots").upsert(
              {
                user_id: profile.id,
                ticker: pos.ticker,
                broker: pos.broker,
                current_pl_gbp: pos.totalPL,
                last_alerted_pl: existing?.last_alerted_pl ?? 0,
              },
              { onConflict: "user_id,ticker,broker" }
            )
          }
        } else {
          // Below threshold, reset snapshot
          await writer.from("portfolio_snapshots").upsert(
            {
              user_id: profile.id,
              ticker: pos.ticker,
              broker: pos.broker,
              current_pl_gbp: pos.totalPL,
              last_alerted_pl: 0,
            },
            { onConflict: "user_id,ticker,broker" }
          )
        }
      }

      // Send push notifications for triggered alerts
      if (triggeredAlerts.length > 0) {
        const { data: subscriptions } = await supabase
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("user_id", profile.id) as unknown as { data: Array<{ endpoint: string; p256dh: string; auth: string }> | null }

        if (subscriptions && subscriptions.length > 0) {
          for (const alert of triggeredAlerts) {
            const sign = alert.pl > 0 ? "+" : "-"
            const payload = JSON.stringify({
              title: `£${Math.abs(alert.pl).toFixed(0)} ${alert.direction} on ${alert.ticker}`,
              body: `${alert.ticker} (${alert.broker}) has reached ${sign}£${Math.abs(alert.pl).toFixed(2)} P&L.`,
              tag: `alert-${alert.ticker}-${alert.broker}`,
              url: "/dashboard",
            })

            for (const sub of subscriptions) {
              try {
                await webpush.sendNotification(
                  {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                  },
                  payload
                )
                alertsSent++
              } catch (err: unknown) {
                // Remove stale subscriptions (410 Gone)
                if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode === 410) {
                  await writer
                    .from("push_subscriptions")
                    .delete()
                    .eq("endpoint", sub.endpoint)
                }
              }
            }
          }
        }
      }
    }

    return {
      success: true,
      backend: "supabase",
      message: [
        `Checked ${usersChecked} user(s), sent ${alertsSent} alert notification(s).`,
        syncErrors.length > 0 ? syncErrors.join(" ") : null,
      ].filter(Boolean).join(" "),
    }
  }
}
