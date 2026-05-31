import { NextResponse } from "next/server"
import webpush from "web-push"
import { createClient } from "@/utils/supabase/server"
import { getBrokerProvider } from "@/lib/integrations/factory"

export async function POST() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 })
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    return NextResponse.json({ message: "VAPID keys not configured." }, { status: 503 })
  }

  webpush.setVapidDetails("mailto:alerts@stocksync.app", publicKey, privateKey)

  // Get user's credentials
  const { data: profile } = await supabase
    .from("profiles")
    .select("t212_api_key, t212_api_secret, etoro_api_key, etoro_api_secret")
    .eq("id", user.id)
    .single() as any

  // Fetch positions
  const positions: Array<{ ticker: string; broker: string; livePrice: number; totalPL: number; nativeCurrency: string }> = []

  if (profile?.t212_api_key) {
    const provider = getBrokerProvider("t212")
    if (provider) {
      try {
        const pos = await provider.getPositions({ apiKey: profile.t212_api_key, apiSecret: profile.t212_api_secret ?? "" })
        positions.push(...pos.map(p => ({ ticker: p.ticker, broker: "T212", livePrice: p.livePrice, totalPL: p.totalPL, nativeCurrency: p.nativeCurrency })))
      } catch { /* skip */ }
    }
  }

  if (profile?.etoro_api_key) {
    const provider = getBrokerProvider("etoro")
    if (provider) {
      try {
        const pos = await provider.getPositions({ apiKey: profile.etoro_api_key, apiSecret: profile.etoro_api_secret ?? "" })
        positions.push(...pos.map(p => ({ ticker: p.ticker, broker: "eToro", livePrice: p.livePrice, totalPL: p.totalPL, nativeCurrency: p.nativeCurrency })))
      } catch { /* skip */ }
    }
  }

  if (positions.length === 0) {
    return NextResponse.json({ message: "No positions found. Sync your brokers first." }, { status: 400 })
  }

  // Build notification body
  const lines = positions.map(p => {
    const sign = p.totalPL >= 0 ? "+" : ""
    const currency = p.nativeCurrency === "GBP" ? "£" : "$"
    return `${p.ticker} (${p.broker}): ${currency}${p.livePrice.toFixed(2)} | ${sign}${currency}${p.totalPL.toFixed(2)}`
  })

  const payload = JSON.stringify({
    title: `📊 ${positions.length} positions`,
    body: lines.join("\n"),
    tag: "test-notification",
    url: "/dashboard",
  })

  // Get push subscriptions
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id) as any

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ message: "No push subscription found. Enable notifications first." }, { status: 400 })
  }

  let sent = 0
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      sent++
    } catch { /* skip stale */ }
  }

  return NextResponse.json({ message: `Test notification sent (${sent} device${sent === 1 ? "" : "s"}, ${positions.length} positions).` })
}

