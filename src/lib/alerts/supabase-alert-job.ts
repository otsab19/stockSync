import webpush from "web-push"
import type { AlertJobRepository } from "@/lib/alerts/repository"
import type { AlertJobResult } from "@/types/alerts"
import { createServiceRoleClient, getSupabaseServiceRoleSetupMessage } from "@/utils/supabase/server"
import { getBrokerProvider } from "@/lib/integrations/factory"
import type { BrokerInstrumentQuote } from "@/lib/integrations/provider"
import { PROFIT_ALERT_THRESHOLD_GBP } from "@/lib/alerts/thresholds"
import { recordBrokerSync, type SupabaseWriter } from "@/lib/sync/record-broker-sync"
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

type StockAlertRuleRow = {
  id: string
  user_id: string
  broker: "t212" | "etoro"
  ticker: string
  company_name: string
  direction: "up" | "down" | "both"
  threshold_percent: number | string
  baseline_price: number | string
  baseline_currency: "GBP" | "USD"
  instrument_id: string | null
}

type ProfileCredentials = {
  t212_api_key: string | null
  t212_api_secret: string | null
  etoro_api_key: string | null
  etoro_api_secret: string | null
}

type DeleteBuilder = PromiseLike<unknown> & {
  eq(column: string, value: unknown): DeleteBuilder
}

type TableWriter = {
  upsert(values: unknown, options?: unknown): PromiseLike<unknown>
  insert(values: unknown): PromiseLike<unknown>
  update(values: unknown): { eq(column: string, value: unknown): PromiseLike<unknown> }
  delete(): DeleteBuilder
}

type AlertJobWriter = {
  from(table: string): TableWriter
}

async function recordScheduledPositions(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  userId: string,
  broker: "t212" | "etoro",
  positions: PortfolioPosition[]
) {
  const writer = supabase as unknown as SupabaseWriter
  await recordBrokerSync(writer, userId, broker, positions, undefined, {
    trigger: "scheduled",
    preserveSyncMode: true,
  })
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function evaluateStockMoveAlerts(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  writer: AlertJobWriter,
  userId: string,
  positions: PortfolioPosition[],
  credentials: ProfileCredentials
) {
  const { data: rules } = await supabase
    .from("stock_alert_rules")
    .select("id, user_id, broker, ticker, company_name, direction, threshold_percent, baseline_price, baseline_currency, instrument_id")
    .eq("user_id", userId)
    .eq("is_enabled", true) as unknown as { data: StockAlertRuleRow[] | null }

  const positionMap = new Map(positions.map((position) => [`${position.broker}:${position.ticker}`, position]))
  const triggered: Array<{ ticker: string; broker: string; title: string; body: string; tag: string }> = []

  for (const rule of rules ?? []) {
    const position = positionMap.get(`${rule.broker}:${rule.ticker}`)
    let quote: BrokerInstrumentQuote | null = position ? {
      broker: position.broker as "t212" | "etoro",
      id: rule.instrument_id ?? position.ticker,
      ticker: position.ticker,
      companyName: position.companyName,
      livePrice: position.livePrice,
      nativeCurrency: position.nativeCurrency,
    } : null

    if (!quote && rule.instrument_id) {
      const provider = getBrokerProvider(rule.broker)
      const brokerCredentials = rule.broker === "t212"
        ? { apiKey: credentials.t212_api_key ?? "", apiSecret: credentials.t212_api_secret ?? "" }
        : { apiKey: credentials.etoro_api_key ?? "", apiSecret: credentials.etoro_api_secret ?? "" }

      quote = provider?.getInstrumentQuote
        ? await provider.getInstrumentQuote({
          broker: rule.broker,
          id: rule.instrument_id,
          ticker: rule.ticker,
          companyName: rule.company_name,
          nativeCurrency: rule.baseline_currency,
          assetType: "stock",
          isQuoteAvailable: true,
        }, brokerCredentials)
        : null
    }

    if (!quote) continue

    const baselinePrice = toNumber(rule.baseline_price)
    const thresholdPercent = toNumber(rule.threshold_percent)
    if (baselinePrice <= 0 || thresholdPercent <= 0) continue

    const changePercent = ((quote.livePrice - baselinePrice) / baselinePrice) * 100
    const movedUp = changePercent >= thresholdPercent
    const movedDown = changePercent <= -thresholdPercent
    const shouldTrigger = rule.direction === "both"
      ? movedUp || movedDown
      : rule.direction === "up"
        ? movedUp
        : movedDown

    if (!shouldTrigger) continue

    const directionLabel = changePercent >= 0 ? "up" : "down"
    const signedPercent = `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`
    const title = `${quote.ticker} moved ${directionLabel} ${Math.abs(changePercent).toFixed(2)}%`
    const body = `${quote.companyName} moved from ${baselinePrice.toFixed(4)} to ${quote.livePrice.toFixed(4)} (${signedPercent}).`

    triggered.push({
      ticker: quote.ticker,
      broker: quote.broker,
      title,
      body,
      tag: `stock-alert-${rule.id}`,
    })

    await writer.from("stock_alert_rules").update({
      baseline_price: quote.livePrice,
      baseline_currency: quote.nativeCurrency,
      last_triggered_at: new Date().toISOString(),
      last_triggered_price: quote.livePrice,
      updated_at: new Date().toISOString(),
    }).eq("id", rule.id)
  }

  return triggered
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
    const writer = supabase as unknown as AlertJobWriter

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
            if (pos.length > 0) {
              await recordScheduledPositions(supabase, profile.id, "t212", pos)
            }
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
            if (pos.length > 0) {
              await recordScheduledPositions(supabase, profile.id, "etoro", pos)
            }
            positions.push(...pos)
          } catch (error) {
            syncErrors.push(`eToro sync failed for ${profile.id}: ${error instanceof Error ? error.message : "Unknown error"}`)
          }
        }
      }

      usersChecked++

      // Get existing snapshots for this user
      const { data: snapshots } = await supabase
        .from("portfolio_snapshots")
        .select("id, user_id, ticker, broker, current_pl_gbp, last_alerted_pl")
        .eq("user_id", profile.id) as unknown as { data: SnapshotRow[] | null }

      const snapshotMap = new Map<string, SnapshotRow>(
        (snapshots ?? []).map((s) => [`${s.ticker}:${s.broker}`, s as unknown as SnapshotRow])
      )

      const triggeredAlerts: Array<{ ticker: string; broker: string; title: string; body: string; tag: string }> = []
      triggeredAlerts.push(...await evaluateStockMoveAlerts(supabase, writer, profile.id, positions, profile))

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
            const sign = pos.totalPL > 0 ? "+" : "-"
            triggeredAlerts.push({
              ticker: pos.ticker,
              broker: pos.broker,
              title: `£${Math.abs(pos.totalPL).toFixed(0)} ${direction} on ${pos.ticker}`,
              body: `${pos.ticker} (${pos.broker}) has reached ${sign}£${Math.abs(pos.totalPL).toFixed(2)} P&L.`,
              tag: `alert-${pos.ticker}-${pos.broker}`,
            })

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
            const payload = JSON.stringify({
              title: alert.title,
              body: alert.body,
              tag: alert.tag,
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
