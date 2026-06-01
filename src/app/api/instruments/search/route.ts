import { NextResponse } from "next/server"
import { getBrokerProvider } from "@/lib/integrations/factory"
import type { BrokerInstrument } from "@/lib/integrations/provider"
import { createClient } from "@/utils/supabase/server"

type Broker = "t212" | "etoro"

type ProfileRow = {
  t212_api_key: string | null
  t212_api_secret: string | null
  etoro_api_key: string | null
  etoro_api_secret: string | null
}

type PositionRow = {
  broker: Broker
  ticker: string
  company_name: string
  live_price: number | string
  native_currency: "GBP" | "USD"
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function positionToInstrument(position: PositionRow): BrokerInstrument {
  return {
    broker: position.broker,
    id: position.ticker,
    ticker: position.ticker,
    companyName: position.company_name,
    nativeCurrency: position.native_currency,
    assetType: "stock",
    livePrice: toNumber(position.live_price),
    isQuoteAvailable: toNumber(position.live_price) > 0,
  }
}

function mergeInstrumentResults(results: BrokerInstrument[]) {
  const byKey = new Map<string, BrokerInstrument>()

  for (const instrument of results) {
    const key = `${instrument.broker}:${instrument.id}`
    const existing = byKey.get(key)

    if (!existing || (!existing.isQuoteAvailable && instrument.isQuoteAvailable)) {
      byKey.set(key, instrument)
    }
  }

  return Array.from(byKey.values()).slice(0, 16)
}

export async function GET(request: Request) {
  const supabase = await createClient()

  if (!supabase) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 })
  }

  const url = new URL(request.url)
  const query = url.searchParams.get("q")?.trim() ?? ""

  if (query.length < 2) {
    return NextResponse.json({ instruments: [] })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("t212_api_key, t212_api_secret, etoro_api_key, etoro_api_secret")
    .eq("id", user.id)
    .single() as unknown as { data: ProfileRow | null }

  const { data: positions } = await supabase
    .from("positions")
    .select("broker, ticker, company_name, live_price, native_currency")
    .eq("user_id", user.id)
    .limit(200) as unknown as { data: PositionRow[] | null }

  const brokerSearches: Array<Promise<BrokerInstrument[]>> = []

  if (profile?.t212_api_key && profile.t212_api_secret) {
    const provider = getBrokerProvider("t212")
    if (provider?.searchInstruments) {
      brokerSearches.push(provider.searchInstruments(query, {
        apiKey: profile.t212_api_key,
        apiSecret: profile.t212_api_secret,
      }).catch(() => []))
    }
  }

  if (profile?.etoro_api_key && profile.etoro_api_secret) {
    const provider = getBrokerProvider("etoro")
    if (provider?.searchInstruments) {
      brokerSearches.push(provider.searchInstruments(query, {
        apiKey: profile.etoro_api_key,
        apiSecret: profile.etoro_api_secret,
      }).catch(() => []))
    }
  }

  const brokerResults = (await Promise.all(brokerSearches)).flat()

  return NextResponse.json({
    instruments: mergeInstrumentResults([
      ...(positions ?? [])
        .filter((position) => {
          const haystack = `${position.ticker} ${position.company_name}`.toLowerCase()
          return haystack.includes(query.toLowerCase())
        })
        .slice(0, 8)
        .map(positionToInstrument),
      ...brokerResults,
    ]),
  })
}
