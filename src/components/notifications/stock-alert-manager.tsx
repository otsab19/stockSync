"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type AlertDirection = "up" | "down" | "both"

type AlertPosition = {
  broker: "t212" | "etoro"
  id?: string
  ticker: string
  company_name?: string
  companyName?: string
  live_price?: number
  livePrice?: number
  native_currency?: "GBP" | "USD"
  nativeCurrency?: "GBP" | "USD"
  isQuoteAvailable?: boolean
  assetType?: "stock" | "etf" | "crypto"
  exchange?: string
}

type StockAlert = {
  id: string
  broker: "t212" | "etoro"
  ticker: string
  company_name: string
  direction: AlertDirection
  threshold_percent: number
  baseline_price: number
  baseline_currency: "GBP" | "USD"
  is_enabled: boolean
  last_triggered_at: string | null
}

const directionLabels: Record<AlertDirection, string> = {
  up: "Up",
  down: "Down",
  both: "Up or down",
}

function formatPrice(value: number, currency: "GBP" | "USD") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value)
}

function getCompanyName(position: AlertPosition) {
  return position.companyName ?? position.company_name ?? position.ticker
}

function getLivePrice(position: AlertPosition) {
  return position.livePrice ?? position.live_price ?? 0
}

function getNativeCurrency(position: AlertPosition) {
  return position.nativeCurrency ?? position.native_currency ?? "GBP"
}

function getInstrumentId(position: AlertPosition) {
  return position.id ?? position.ticker
}

function hasLiveQuote(position: AlertPosition) {
  return position.isQuoteAvailable ?? getLivePrice(position) > 0
}

export function StockAlertManager() {
  const [positions, setPositions] = useState<AlertPosition[]>([])
  const [searchResults, setSearchResults] = useState<AlertPosition[]>([])
  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [query, setQuery] = useState("")
  const [selectedKey, setSelectedKey] = useState("")
  const [direction, setDirection] = useState<AlertDirection>("both")
  const [threshold, setThreshold] = useState("1")
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadAlerts() {
    setIsLoading(true)
    try {
      const response = await fetch("/api/stock-alerts", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Failed to load stock alerts.")
      setPositions(data.positions ?? [])
      setAlerts(data.alerts ?? [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load stock alerts.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAlerts()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [])

  const filteredPositions = useMemo(() => {
    const search = query.trim().toLowerCase()
    const source = search.length >= 2 ? searchResults : positions
    return source
      .filter((position) => !search
        || position.ticker.toLowerCase().includes(search)
        || getCompanyName(position).toLowerCase().includes(search)
        || position.broker.toLowerCase().includes(search))
      .slice(0, 8)
  }, [positions, query, searchResults])

  useEffect(() => {
    const search = query.trim()

    if (search.length < 2) {
      const resetId = window.setTimeout(() => {
        setSearchResults([])
        setIsSearching(false)
      }, 0)
      return () => window.clearTimeout(resetId)
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true)
      try {
        const response = await fetch(`/api/instruments/search?q=${encodeURIComponent(search)}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || "Failed to search stocks.")
        setSearchResults(data.instruments ?? [])
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : "Failed to search stocks.")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false)
        }
      }
    }, 500)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [query])

  const selectablePositions = query.trim().length >= 2 ? searchResults : positions
  const selectedPosition = selectablePositions.find((position) => `${position.broker}:${getInstrumentId(position)}` === selectedKey)

  async function saveAlert() {
    if (!selectedPosition) {
      setMessage("Choose a stock first.")
      return
    }

    setIsSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/stock-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: selectedPosition.broker,
          ticker: selectedPosition.ticker,
          instrument: {
            broker: selectedPosition.broker,
            id: getInstrumentId(selectedPosition),
            ticker: selectedPosition.ticker,
            companyName: getCompanyName(selectedPosition),
            nativeCurrency: getNativeCurrency(selectedPosition),
            assetType: selectedPosition.assetType ?? "stock",
            exchange: selectedPosition.exchange,
            livePrice: getLivePrice(selectedPosition),
            isQuoteAvailable: hasLiveQuote(selectedPosition),
          },
          direction,
          thresholdPercent: Number(threshold),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Failed to save stock alert.")
      setMessage("Stock alert saved.")
      await loadAlerts()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save stock alert.")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteAlert(id: string) {
    setMessage(null)
    const response = await fetch("/api/stock-alerts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setMessage(data.message || "Failed to delete stock alert.")
      return
    }
    await loadAlerts()
  }

  return (
    <Card className="border-border sm:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Stock move alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Search synced holdings or broker instruments and get a push alert when the stock moves by the selected percentage from the saved baseline price.
        </p>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.7fr_0.7fr_auto]">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Search stock</span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ticker or company"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-4 pl-10 text-sm outline-none"
              />
            </div>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Direction</span>
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as AlertDirection)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none"
            >
              <option value="both">Up or down</option>
              <option value="up">Up only</option>
              <option value="down">Down only</option>
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Move %</span>
            <input
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              inputMode="decimal"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none"
            />
          </label>

          <div className="flex items-end">
            <Button onClick={() => void saveAlert()} disabled={isSaving || !selectedPosition} className="w-full rounded-xl">
              {isSaving ? "Saving..." : "Save alert"}
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading || isSearching ? (
            <p className="text-sm text-muted-foreground">Loading synced stocks...</p>
          ) : filteredPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stocks found. Try a ticker, or sync a broker first.</p>
          ) : filteredPositions.map((position) => {
            const key = `${position.broker}:${getInstrumentId(position)}`
            const livePrice = getLivePrice(position)
            const nativeCurrency = getNativeCurrency(position)
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                disabled={!hasLiveQuote(position)}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                  selectedKey === key
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-muted/40 hover:bg-muted/40"
                }`}
              >
                <span className="block font-medium">{position.ticker}</span>
                <span className="block truncate text-xs text-muted-foreground">{getCompanyName(position)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {position.broker === "t212" ? "Trading 212" : "eToro"} · {hasLiveQuote(position) && livePrice > 0
                    ? formatPrice(livePrice, nativeCurrency)
                    : "quote unavailable"}
                </span>
              </button>
            )
          })}
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Active alerts</h3>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock move alerts yet.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{alert.ticker} · {directionLabels[alert.direction]} {alert.threshold_percent}%</p>
                    <p className="text-xs text-muted-foreground">
                      Baseline {formatPrice(alert.baseline_price, alert.baseline_currency)}
                      {alert.last_triggered_at ? ` · last triggered ${new Date(alert.last_triggered_at).toLocaleString("en-GB")}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void deleteAlert(alert.id)} className="gap-1">
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
