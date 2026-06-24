import { NextResponse } from "next/server"
import { getBrokerProvider } from "@/lib/integrations/factory"
import { getAuthenticatedOrderContext, getBrokerCredentials } from "@/lib/orders/server"
import type { MarketCandleInterval } from "@/types/pending-orders"

const allowedIntervals: MarketCandleInterval[] = ["OneMinute", "FiveMinutes", "FifteenMinutes", "OneHour", "OneDay"]

export async function GET(request: Request) {
  const context = await getAuthenticatedOrderContext()
  if ("error" in context) return context.error

  const url = new URL(request.url)
  const broker = url.searchParams.get("broker") === "t212" ? "t212" : "etoro"
  const instrumentId = url.searchParams.get("instrumentId")?.trim()
  const intervalParam = url.searchParams.get("interval") ?? "OneDay"
  const count = Number(url.searchParams.get("count") ?? "30")
  const interval = allowedIntervals.includes(intervalParam as MarketCandleInterval)
    ? intervalParam as MarketCandleInterval
    : "OneDay"

  if (!instrumentId) {
    return NextResponse.json({ message: "instrumentId is required." }, { status: 400 })
  }

  if (broker !== "etoro") {
    return NextResponse.json({ message: "Candle data is only available for eToro instruments right now." }, { status: 400 })
  }

  const provider = getBrokerProvider("etoro")
  if (!provider?.getInstrumentCandles) {
    return NextResponse.json({ message: "Candle data is not configured for this broker." }, { status: 400 })
  }

  const credentials = getBrokerCredentials(context.profile ?? null, "etoro")
  const candles = await provider.getInstrumentCandles(instrumentId, { interval, count }, credentials)

  return NextResponse.json({ candles, interval })
}
