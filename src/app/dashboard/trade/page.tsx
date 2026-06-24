"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, RefreshCw, Search, ShieldCheck } from "lucide-react"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { PendingOrdersPanel } from "@/components/dashboard/pending-orders-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { BrokerInstrument } from "@/lib/integrations/provider"
import type { OrderPreview, OrderRequestRow, TradeOrderRequest } from "@/types/orders"

type PreviewResponse = {
  preview: OrderPreview
  canSubmit: boolean
}

function getBrokerLabel(broker: BrokerInstrument["broker"]) {
  return broker === "t212" ? "Trading 212" : "eToro"
}

function createIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function currency(value?: number) {
  if (value === undefined) return "Not available"
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value)
}

export default function TradePage() {
  const [query, setQuery] = useState("")
  const [instruments, setInstruments] = useState<BrokerInstrument[]>([])
  const [selectedInstrument, setSelectedInstrument] = useState<BrokerInstrument | null>(null)
  const [orders, setOrders] = useState<OrderRequestRow[]>([])
  const [preview, setPreview] = useState<OrderPreview | null>(null)
  const [confirmation, setConfirmation] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const [form, setForm] = useState({
    broker: "t212" as TradeOrderRequest["broker"],
    side: "buy" as TradeOrderRequest["side"],
    orderType: "market" as TradeOrderRequest["orderType"],
    inputMode: "quantity" as TradeOrderRequest["inputMode"],
    quantity: "",
    value: "",
    limitPrice: "",
    stopPrice: "",
    stopLossPrice: "",
    takeProfitPrice: "",
    timeValidity: "DAY" as "DAY" | "GOOD_TILL_CANCEL",
    leverage: "1",
  })

  const orderRequest = useMemo<TradeOrderRequest | null>(() => {
    if (!selectedInstrument) return null

    return {
      broker: selectedInstrument.broker,
      instrumentId: selectedInstrument.id,
      ticker: selectedInstrument.ticker,
      companyName: selectedInstrument.companyName,
      side: form.side,
      orderType: form.orderType,
      inputMode: form.inputMode,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      value: form.value ? Number(form.value) : undefined,
      limitPrice: form.limitPrice ? Number(form.limitPrice) : undefined,
      stopPrice: form.stopPrice ? Number(form.stopPrice) : undefined,
      stopLossPrice: form.stopLossPrice ? Number(form.stopLossPrice) : undefined,
      takeProfitPrice: form.takeProfitPrice ? Number(form.takeProfitPrice) : undefined,
      timeValidity: form.timeValidity,
      leverage: Number(form.leverage) || 1,
      idempotencyKey,
      confirmationText: confirmation,
    }
  }, [confirmation, form, idempotencyKey, selectedInstrument])

  const loadOrders = useCallback(async () => {
    const response = await fetch("/api/orders")
    if (response.ok) {
      const data = await response.json() as { orders: OrderRequestRow[] }
      setOrders(data.orders)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    void fetch("/api/orders")
      .then(async (response) => response.ok ? await response.json() as { orders: OrderRequestRow[] } : { orders: [] })
      .then((data) => {
        if (isMounted) setOrders(data.orders)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const searchInstruments = async () => {
    if (query.trim().length < 2) return
    setIsSearching(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/instruments/search?q=${encodeURIComponent(query.trim())}`)
      const data = await response.json() as { instruments?: BrokerInstrument[]; message?: string }
      if (!response.ok) throw new Error(data.message ?? "Instrument search failed.")
      setInstruments(data.instruments ?? [])
      if ((data.instruments ?? []).length === 0) {
        setSelectedInstrument(null)
        setPreview(null)
        setConfirmation("")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Instrument search failed.")
    } finally {
      setIsSearching(false)
    }
  }

  const updateForm = <K extends keyof typeof form>(key: K, value: typeof form[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setPreview(null)
    setConfirmation("")
    setIdempotencyKey(createIdempotencyKey())
  }

  const selectInstrument = (instrument: BrokerInstrument) => {
    setSelectedInstrument(instrument)
    setForm((current) => ({ ...current, broker: instrument.broker }))
    setQuery(instrument.ticker)
    setPreview(null)
    setConfirmation("")
    setIdempotencyKey(createIdempotencyKey())
    setMessage(null)
  }

  const previewOrder = async () => {
    if (!orderRequest) return
    setIsPreviewing(true)
    setMessage(null)
    try {
      const response = await fetch("/api/orders/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderRequest),
      })
      const data = await response.json() as PreviewResponse & { message?: string }
      if (!response.ok) throw new Error(data.message ?? "Preview failed.")
      setPreview(data.preview)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preview failed.")
    } finally {
      setIsPreviewing(false)
    }
  }

  const submitOrder = async () => {
    if (!orderRequest || !preview) return
    setIsSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch("/api/orders/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...orderRequest, confirmationText: confirmation }),
      })
      const data = await response.json() as { message?: string }
      if (!response.ok) throw new Error(data.message ?? "Order submission failed.")
      setMessage(data.message ?? "Order submitted.")
      setPreview(null)
      setConfirmation("")
      setIdempotencyKey(createIdempotencyKey())
      await loadOrders()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order submission failed.")
      await loadOrders()
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmationMatches = preview ? confirmation.trim().toUpperCase() === preview.requiredConfirmation : false

  return (
    <PageShell>
      <PageHeader
        eyebrow="Live Trading"
        title="Trade ticket"
        description="Place broker orders only after previewing the ticket and typing the exact confirmation phrase."
        badges={
          <>
            <Badge variant="secondary">Feature flag required</Badge>
            <Badge variant="outline">Audited before broker submit</Badge>
          </>
        }
      />

      {message ? (
        <Card className="border-amber-400/30 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{message}</span>
          </CardContent>
        </Card>
      ) : null}

      <PendingOrdersPanel />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Build order</CardTitle>
            <CardDescription>Search ticker from the API first. The selected result fills ticker, broker, and instrument id for the order.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPreview(null)
                  setConfirmation("")
                }}
                onKeyDown={(event) => event.key === "Enter" && void searchInstruments()}
                placeholder="Search ticker, e.g. AAPL"
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
              <Button onClick={() => void searchInstruments()} disabled={isSearching || query.trim().length < 2}>
                {isSearching ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}
                Search
              </Button>
            </div>

            {instruments.length > 0 ? (
              <div className="grid gap-2">
                {instruments.map((instrument) => (
                  <button
                    key={`${instrument.broker}:${instrument.id}`}
                    type="button"
                    onClick={() => selectInstrument(instrument)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition hover:border-primary/40 ${
                      selectedInstrument?.broker === instrument.broker && selectedInstrument.id === instrument.id
                        ? "border-primary/50 bg-primary/10"
                        : "border-white/8 bg-white/[0.03]"
                    }`}
                  >
                    <span className="font-semibold">{instrument.ticker}</span>
                    <span className="ml-2 text-muted-foreground">{instrument.companyName}</span>
                    <Badge className="ml-3" variant="outline">{getBrokerLabel(instrument.broker)}</Badge>
                    <span className="ml-2 text-xs text-muted-foreground">{instrument.id}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {selectedInstrument ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Selected API result</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <strong>{selectedInstrument.ticker}</strong>
                  <span className="text-muted-foreground">{selectedInstrument.companyName}</span>
                  <Badge variant="secondary">{getBrokerLabel(selectedInstrument.broker)}</Badge>
                  <Badge variant="outline">ID: {selectedInstrument.id}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">This selected instrument is what fills the order request. Search and select another result to trade a different ticker or broker.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-muted-foreground">
                No ticker selected yet. Search and choose a result before previewing an order.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Broker
                <input
                  value={selectedInstrument ? getBrokerLabel(selectedInstrument.broker) : "Select ticker from search"}
                  readOnly
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Side
                <select value={form.side} onChange={(event) => updateForm("side", event.target.value as typeof form.side)} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-foreground">
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Order type
                <select value={form.orderType} onChange={(event) => updateForm("orderType", event.target.value as typeof form.orderType)} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-foreground">
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                  <option value="stop">Stop</option>
                  <option value="stop_limit">Stop limit</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Input
                <select value={form.inputMode} onChange={(event) => updateForm("inputMode", event.target.value as typeof form.inputMode)} className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm text-foreground">
                  <option value="quantity">Quantity</option>
                  <option value="value">Value</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Quantity
                <input value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} inputMode="decimal" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Value
                <input value={form.value} onChange={(event) => updateForm("value", event.target.value)} inputMode="decimal" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Limit price
                <input value={form.limitPrice} onChange={(event) => updateForm("limitPrice", event.target.value)} inputMode="decimal" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Stop price
                <input value={form.stopPrice} onChange={(event) => updateForm("stopPrice", event.target.value)} inputMode="decimal" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Stop loss
                <input value={form.stopLossPrice} onChange={(event) => updateForm("stopLossPrice", event.target.value)} inputMode="decimal" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Take profit
                <input value={form.takeProfitPrice} onChange={(event) => updateForm("takeProfitPrice", event.target.value)} inputMode="decimal" className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" />
              </label>
            </div>

            <Button onClick={() => void previewOrder()} disabled={!selectedInstrument || isPreviewing}>
              {isPreviewing ? <RefreshCw className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Preview order
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preview and confirmation</CardTitle>
              <CardDescription>Type the exact phrase shown here before submit unlocks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {preview ? (
                <>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm">
                    <div className="flex items-center justify-between"><span>Action</span><strong>{preview.side.toUpperCase()} {preview.ticker}</strong></div>
                    <div className="mt-2 flex items-center justify-between"><span>Type</span><strong>{preview.orderType}</strong></div>
                    <div className="mt-2 flex items-center justify-between"><span>Estimated notional</span><strong>{currency(preview.estimatedNotional)}</strong></div>
                  </div>
                  <div className="space-y-2">
                    {preview.warnings.map((warning) => <p key={warning} className="text-xs leading-5 text-amber-200">{warning}</p>)}
                  </div>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">Confirmation phrase: <span className="text-foreground">{preview.requiredConfirmation}</span>
                    <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" />
                  </label>
                  <Button variant="destructive" onClick={() => void submitOrder()} disabled={!confirmationMatches || isSubmitting}>
                    Submit live order
                  </Button>
                </>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">Select an instrument and preview the order to see warnings, notional, and the confirmation phrase.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent orders</CardTitle>
              <CardDescription>Last 50 audited order attempts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No order attempts yet.</p>
              ) : orders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{order.side.toUpperCase()} {order.ticker}</span>
                    <Badge variant={order.status === "failed" || order.status === "rejected" ? "destructive" : "secondary"}>{order.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{order.broker} · {order.orderType} · {new Date(order.createdAt).toLocaleString()}</p>
                  {order.errorMessage ? <p className="mt-2 text-xs text-destructive">{order.errorMessage}</p> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
