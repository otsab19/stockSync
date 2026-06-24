"use client"

import { useEffect, useMemo, useState } from "react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts"
import type { MarketCandle } from "@/types/pending-orders"

type TickerMiniChartProps = {
  broker: "etoro" | "t212"
  instrumentId: string
  ticker: string
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value)
}

export function TickerMiniChart({ broker, instrumentId, ticker }: TickerMiniChartProps) {
  const [candles, setCandles] = useState<MarketCandle[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    void fetch(`/api/market/candles?broker=${broker}&instrumentId=${encodeURIComponent(instrumentId)}&count=30`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { candles?: MarketCandle[]; message?: string }
        if (!response.ok) throw new Error(data.message ?? "Failed to load candles.")
        if (isMounted) {
          setCandles(data.candles ?? [])
          setError(null)
        }
      })
      .catch((fetchError) => {
        if (isMounted) {
          setCandles([])
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load candles.")
        }
      })

    return () => {
      isMounted = false
    }
  }, [broker, instrumentId])

  const chartData = useMemo(
    () => candles.map((candle) => ({
      label: new Date(candle.timestamp).toLocaleDateString("en-GB", { month: "short", day: "numeric" }),
      close: candle.close,
    })),
    [candles]
  )

  if (broker !== "etoro") {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-muted-foreground">
        Price history charts are available for eToro instruments. Use Trade to sell on Trading 212.
      </div>
    )
  }

  if (error) {
    return <p className="text-xs text-muted-foreground">{error}</p>
  }

  if (chartData.length === 0) {
    return <p className="text-xs text-muted-foreground">Loading {ticker} chart...</p>
  }

  return (
    <div className="h-28 rounded-xl border border-white/8 bg-white/[0.02] p-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            formatter={(value) => formatPrice(Number(value))}
            labelFormatter={(label) => String(label)}
            contentStyle={{ background: "rgba(15, 23, 37, 0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
          />
          <Area type="monotone" dataKey="close" stroke="#34d399" fill="rgba(52,211,153,0.15)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
