"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  getAllTickerThresholds,
  getGlobalThreshold,
  removeTickerThreshold,
  setGlobalThreshold,
  setTickerThreshold,
  type TickerThreshold,
} from "@/lib/alerts/custom-thresholds"

function ThresholdRow({
  label,
  thresholdGbp,
  nearWindowGbp,
  isGlobal,
  onSave,
  onRemove,
}: {
  label: string
  thresholdGbp: number
  nearWindowGbp: number
  isGlobal: boolean
  onSave: (threshold: number, nearWindow: number) => void
  onRemove?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [tValue, setTValue] = useState(String(thresholdGbp))
  const [nValue, setNValue] = useState(String(nearWindowGbp))
  const [error, setError] = useState("")

  useEffect(() => {
    setTValue(String(thresholdGbp))
    setNValue(String(nearWindowGbp))
  }, [thresholdGbp, nearWindowGbp])

  function handleSave() {
    const t = parseFloat(tValue)
    const n = parseFloat(nValue)
    if (!Number.isFinite(t) || t <= 0) {
      setError("Threshold must be a positive number.")
      return
    }
    if (!Number.isFinite(n) || n < 0) {
      setError("Near-window must be 0 or positive.")
      return
    }
    if (n >= t) {
      setError("Near-window must be smaller than the threshold.")
      return
    }
    setError("")
    onSave(t, n)
    setEditing(false)
  }

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {isGlobal && <Badge variant="outline" className="text-[0.65rem]">Default</Badge>}
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Alert at £</label>
            <input
              type="number"
              min="0.01"
              step="1"
              value={tValue}
              onChange={(e) => setTValue(e.target.value)}
              className="w-20 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Near-alert £</label>
            <input
              type="number"
              min="0"
              step="1"
              value={nValue}
              onChange={(e) => setNValue(e.target.value)}
              className="w-20 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
          <div className="flex gap-1.5">
            <Button size="sm" onClick={handleSave} className="h-7 px-3">Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError("") }} className="h-7 px-3">Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            Alert at <span className="font-semibold text-foreground">£{thresholdGbp}</span>
            {" · "}near-alert at <span className="font-semibold text-foreground">£{nearWindowGbp}</span> before
          </span>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-7 px-2.5 text-xs border-white/10">Edit</Button>
          {onRemove && (
            <Button size="sm" variant="ghost" onClick={onRemove} className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function AlertThresholdSettings() {
  const [globalThreshold, setGlobalThresholdState] = useState({ thresholdGbp: 25, nearWindowGbp: 5 })
  const [perTicker, setPerTicker] = useState<TickerThreshold[]>([])
  const [newTicker, setNewTicker] = useState("")
  const [addError, setAddError] = useState("")

  useEffect(() => {
    setGlobalThresholdState(getGlobalThreshold())
    setPerTicker(getAllTickerThresholds())
  }, [])

  function handleSaveGlobal(thresholdGbp: number, nearWindowGbp: number) {
    setGlobalThreshold(thresholdGbp, nearWindowGbp)
    setGlobalThresholdState({ thresholdGbp, nearWindowGbp })
  }

  function handleSaveTicker(ticker: string, thresholdGbp: number, nearWindowGbp: number) {
    setTickerThreshold(ticker, thresholdGbp, nearWindowGbp)
    setPerTicker(getAllTickerThresholds())
  }

  function handleRemoveTicker(ticker: string) {
    removeTickerThreshold(ticker)
    setPerTicker(getAllTickerThresholds())
  }

  function handleAddTicker() {
    const t = newTicker.trim().toUpperCase()
    if (!t) {
      setAddError("Enter a ticker symbol.")
      return
    }
    if (perTicker.some((pt) => pt.ticker === t)) {
      setAddError("A custom threshold for this ticker already exists.")
      return
    }
    setAddError("")
    handleSaveTicker(t, globalThreshold.thresholdGbp, globalThreshold.nearWindowGbp)
    setNewTicker("")
  }

  return (
    <Card className="border-white/10 sm:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Alert thresholds</CardTitle>
        <CardDescription>
          Set how much a position's P/L (in GBP) must move before an alert fires. Per-ticker overrides take precedence over the global default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ThresholdRow
          label="Global default"
          thresholdGbp={globalThreshold.thresholdGbp}
          nearWindowGbp={globalThreshold.nearWindowGbp}
          isGlobal
          onSave={handleSaveGlobal}
        />

        {perTicker.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Per-ticker overrides</p>
            {perTicker.map((pt) => (
              <ThresholdRow
                key={pt.ticker}
                label={pt.ticker}
                thresholdGbp={pt.thresholdGbp}
                nearWindowGbp={pt.nearWindowGbp}
                isGlobal={false}
                onSave={(t, n) => handleSaveTicker(pt.ticker, t, n)}
                onRemove={() => handleRemoveTicker(pt.ticker)}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            type="text"
            placeholder="Ticker (e.g. AAPL)"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleAddTicker()}
            className="w-36 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button size="sm" variant="outline" onClick={handleAddTicker} className="gap-1.5 border-white/10">
            <Plus className="size-3.5" />
            Add override
          </Button>
          {addError && <p className="w-full text-xs text-destructive">{addError}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
