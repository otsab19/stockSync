"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { TickerMiniChart } from "@/components/dashboard/ticker-mini-chart"
import type { PortfolioPosition } from "@/types/portfolio"

type PositionDetailPanelProps = {
  position: PortfolioPosition
}

export function PositionDetailPanel({ position }: PositionDetailPanelProps) {
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const requiredConfirmation = `CLOSE ${position.ticker}`
  const positionId = position.externalPositionId?.startsWith("position:")
    ? position.externalPositionId
    : null

  const closePosition = async () => {
    if (position.broker !== "etoro" || !positionId || !position.brokerInstrumentId) {
      return
    }

    setIsClosing(true)
    setMessage(null)
    try {
      const response = await fetch("/api/positions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: position.broker,
          positionId,
          instrumentId: position.brokerInstrumentId,
          ticker: position.ticker,
          confirmationText: confirmation,
        }),
      })
      const data = await response.json() as { message?: string }
      if (!response.ok) throw new Error(data.message ?? "Close failed.")
      setMessage("Close order submitted to eToro.")
      setConfirmation("")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Close failed.")
    } finally {
      setIsClosing(false)
    }
  }

  return (
    <div className="grid gap-4 border-t border-border bg-muted/40 px-4 py-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-3 text-xs text-muted-foreground">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p>Position ID: {position.externalPositionId}</p>
            <p>Type: {position.assetType.toUpperCase()}</p>
            <p>Alert gap: £{position.alertDelta.toFixed(2)}</p>
          </div>
          <div className="space-y-1">
            <p>Recent move: {position.recentChange >= 0 ? "+" : ""}{position.recentChange.toFixed(2)}%</p>
            <p>FX rate: {position.fxRateToGbp.toFixed(4)}</p>
            <p>Broker instrument: {position.brokerInstrumentId ?? "—"}</p>
          </div>
        </div>

        {position.broker === "etoro" && positionId && position.brokerInstrumentId ? (
          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
            <p className="font-medium text-foreground">Close position</p>
            <p>Type <span className="font-mono text-foreground">{requiredConfirmation}</span> to confirm a full market close on eToro.</p>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={requiredConfirmation}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
            />
            <Button size="sm" variant="destructive" disabled={isClosing} onClick={() => void closePosition()}>
              {isClosing ? "Closing..." : "Close full position"}
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-3 py-3">
            <p className="font-medium text-foreground">Sell from holdings</p>
            <p className="mt-1">Trading 212 closes via a sell order on the trade ticket.</p>
            <Link
              href={`/dashboard/trade?q=${encodeURIComponent(position.ticker)}`}
              className="mt-2 inline-flex text-sm font-medium text-primary hover:text-primary/80"
            >
              Open trade ticket
            </Link>
          </div>
        )}

        {message ? <p>{message}</p> : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Price history</p>
        {position.brokerInstrumentId ? (
          <TickerMiniChart
            broker={position.broker === "etoro" ? "etoro" : "t212"}
            instrumentId={position.brokerInstrumentId}
            ticker={position.ticker}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Sync holdings again to load instrument metadata for charts.</p>
        )}
      </div>
    </div>
  )
}
