"use client"

import { Fragment, type FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { Brain, ChevronDown, Plus, RefreshCw, Search } from "lucide-react"
import { PageShell } from "@/components/app/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type AnalysisTargetStatus = "pending" | "running" | "analyzed" | "paused"

type LlmAnalysis = {
  id: string
  ticker: string
  companyName: string
  broker: string | null
  analysisDate: string
  provider: string
  model: string
  recommendation: string
  confidence: number | null
  horizon: string | null
  thesis: string | null
  risks: string | null
  prompt: string | null
  rawOutput: unknown
  createdAt: string
  updatedAt: string
}

type AnalysisTarget = {
  id: string
  ticker: string
  companyName: string
  broker: string | null
  status: AnalysisTargetStatus
  priority: number
  notes: string | null
  lastAnalyzedAt: string | null
  createdAt: string
  updatedAt: string
}

type InstrumentSearchResult = {
  broker: "t212" | "etoro"
  id?: string
  ticker: string
  companyName?: string
  company_name?: string
  nativeCurrency?: "GBP" | "USD"
  native_currency?: "GBP" | "USD"
  assetType?: "stock" | "etf" | "crypto"
  exchange?: string
  livePrice?: number
  live_price?: number
  isQuoteAvailable?: boolean
}

type AnalysisResponse = {
  analyses?: LlmAnalysis[]
  message?: string
}

type TargetsResponse = {
  targets?: AnalysisTarget[]
  target?: AnalysisTarget
  message?: string
}

type RawOutputObject = {
  whatWouldChangeView?: unknown
  changeView?: unknown
  keyReasons?: unknown
  reasons?: unknown
  summary?: unknown
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatConfidence(value: number | null) {
  if (value === null) return "—"
  return value <= 1 ? `${Math.round(value * 100)}%` : `${value.toFixed(0)}%`
}

function getRecommendationClassName(recommendation: string) {
  const normalized = recommendation.toLowerCase()
  if (["buy", "bullish", "strong_buy", "strong buy"].includes(normalized)) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  if (["sell", "bearish", "strong_sell", "strong sell"].includes(normalized)) return "border-red-500/20 bg-red-500/10 text-red-300"
  if (["hold", "neutral", "watch"].includes(normalized)) return "border-amber-500/20 bg-amber-500/10 text-amber-200"
  return "border-border bg-muted/40 text-muted-foreground"
}

function getStatusClassName(status: AnalysisTargetStatus) {
  if (status === "pending") return "border-sky-500/20 bg-sky-500/10 text-sky-300"
  if (status === "running") return "border-violet-500/20 bg-violet-500/10 text-violet-300"
  if (status === "analyzed") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  return "border-border bg-muted/40 text-muted-foreground"
}

function hasRawOutput(value: unknown) {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

function getRawOutputText(value: unknown, keys: Array<keyof RawOutputObject>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const output = value as RawOutputObject

  for (const key of keys) {
    const entry = output[key]
    if (Array.isArray(entry)) return entry.map(String).join("\n")
    if (typeof entry === "string" && entry.trim()) return entry
  }

  return null
}

function matchesTickerSearch(searchTerm: string, values: Array<string | null | undefined>) {
  const query = searchTerm.trim().toLowerCase()
  if (!query) return true
  return values.some((value) => value?.toLowerCase().includes(query))
}

function getInstrumentCompanyName(instrument: InstrumentSearchResult) {
  return instrument.companyName ?? instrument.company_name ?? instrument.ticker
}

function getInstrumentPrice(instrument: InstrumentSearchResult) {
  return instrument.livePrice ?? instrument.live_price ?? 0
}

function getInstrumentCurrency(instrument: InstrumentSearchResult) {
  return instrument.nativeCurrency ?? instrument.native_currency ?? "GBP"
}

function formatInstrumentPrice(instrument: InstrumentSearchResult) {
  const price = getInstrumentPrice(instrument)
  if (!price) return "No live quote"

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: getInstrumentCurrency(instrument),
    maximumFractionDigits: price >= 100 ? 2 : 4,
  }).format(price)
}

function DetailBlock({ title, children }: { title: string; children: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 card-shadow">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{children || `No ${title.toLowerCase()} saved.`}</p>
    </div>
  )
}

export default function DashboardAnalysisPage() {
  const [analyses, setAnalyses] = useState<LlmAnalysis[]>([])
  const [targets, setTargets] = useState<AnalysisTarget[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isAddingTarget, setIsAddingTarget] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [modelFilter, setModelFilter] = useState("all")
  const [recommendationFilter, setRecommendationFilter] = useState("all")
  const [providerFilter, setProviderFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("all")
  const [targetStatusFilter, setTargetStatusFilter] = useState<AnalysisTargetStatus | "all">("all")
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null)
  const [tickerSearch, setTickerSearch] = useState("")
  const [tickerSearchResults, setTickerSearchResults] = useState<InstrumentSearchResult[]>([])
  const [newTicker, setNewTicker] = useState("")
  const [newCompanyName, setNewCompanyName] = useState("")
  const [newBroker, setNewBroker] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [isSearchingTickers, setIsSearchingTickers] = useState(false)

  const loadDashboard = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    try {
      if (mode === "refresh") setIsRefreshing(true)
      const [analysisResponse, targetsResponse] = await Promise.all([
        fetch("/api/llm-analyses", { cache: "no-store" }),
        fetch("/api/llm-analysis-targets", { cache: "no-store" }),
      ])
      const analysisPayload = await analysisResponse.json() as AnalysisResponse
      const targetsPayload = await targetsResponse.json() as TargetsResponse

      if (!analysisResponse.ok) {
        setMessage(analysisPayload.message ?? "Failed to load LLM analyses.")
        setAnalyses([])
      } else {
        setAnalyses(analysisPayload.analyses ?? [])
      }

      if (!targetsResponse.ok) {
        setMessage(targetsPayload.message ?? "Failed to load analysis targets.")
        setTargets([])
      } else {
        setTargets(targetsPayload.targets ?? [])
        if (analysisResponse.ok) setMessage(null)
      }
    } catch (error) {
      console.error("Failed to load AI analysis dashboard:", error)
      setMessage("Failed to load AI analysis dashboard.")
      setAnalyses([])
      setTargets([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadDashboard() }, 0)
    return () => { window.clearTimeout(timeoutId) }
  }, [loadDashboard])

  useEffect(() => {
    const query = tickerSearch.trim()

    if (query.length < 2) {
      const resetId = window.setTimeout(() => {
        setTickerSearchResults([])
        setIsSearchingTickers(false)
      }, 0)
      return () => window.clearTimeout(resetId)
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingTickers(true)
      try {
        const response = await fetch(`/api/instruments/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const payload = await response.json() as { instruments?: InstrumentSearchResult[]; message?: string }
        if (!response.ok) throw new Error(payload.message || "Failed to search stocks.")
        setTickerSearchResults(payload.instruments ?? [])
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : "Failed to search stocks.")
          setTickerSearchResults([])
        }
      } finally {
        if (!controller.signal.aborted) setIsSearchingTickers(false)
      }
    }, 500)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [tickerSearch])

  function selectInstrument(instrument: InstrumentSearchResult) {
    setNewTicker(instrument.ticker.toUpperCase())
    setNewCompanyName(getInstrumentCompanyName(instrument))
    setNewBroker(instrument.broker)
    setTickerSearch(`${instrument.ticker} ${getInstrumentCompanyName(instrument)}`)
    setTickerSearchResults([])
  }

  async function handleAddTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ticker = newTicker.trim().toUpperCase()
    if (!ticker) {
      setMessage("Enter a ticker to queue for analysis.")
      return
    }

    setIsAddingTarget(true)
    setMessage(null)
    try {
      const response = await fetch("/api/llm-analysis-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          companyName: newCompanyName.trim(),
          broker: newBroker.trim(),
          notes: newNotes.trim(),
        }),
      })
      const payload = await response.json() as TargetsResponse

      if (!response.ok || !payload.target) {
        setMessage(payload.message ?? "Failed to add ticker.")
        return
      }

      const savedTarget = payload.target
      setTargets((currentTargets) => {
        const nextTargets = currentTargets.filter((target) => target.id !== savedTarget.id)
        return [savedTarget, ...nextTargets]
      })
      setNewTicker("")
      setNewCompanyName("")
      setNewBroker("")
      setNewNotes("")
      setTickerSearch("")
      setTickerSearchResults([])
      setMessage(`${ticker} added to the AI analysis source table.`)
    } catch (error) {
      console.error("Failed to add analysis target:", error)
      setMessage("Failed to add ticker.")
    } finally {
      setIsAddingTarget(false)
    }
  }

  const latestAnalysis = analyses[0] ?? null
  const modelOptions = useMemo(() => Array.from(new Set(analyses.map((analysis) => analysis.model))).sort(), [analyses])
  const providerOptions = useMemo(() => Array.from(new Set(analyses.map((analysis) => analysis.provider))).sort(), [analyses])
  const recommendationOptions = useMemo(() => Array.from(new Set(analyses.map((analysis) => analysis.recommendation))).sort(), [analyses])
  const filteredAnalyses = useMemo(
    () => analyses.filter((analysis) => {
      const matchesSearch = matchesTickerSearch(searchTerm, [
        analysis.ticker,
        analysis.companyName,
        analysis.broker,
        analysis.model,
        analysis.recommendation,
      ])
      const matchesModel = modelFilter === "all" || analysis.model === modelFilter
      const matchesProvider = providerFilter === "all" || analysis.provider === providerFilter
      const matchesRecommendation = recommendationFilter === "all" || analysis.recommendation === recommendationFilter
      const matchesDate = dateFilter === "all" || analysis.analysisDate === dateFilter
      return matchesSearch && matchesModel && matchesProvider && matchesRecommendation && matchesDate
    }),
    [analyses, dateFilter, modelFilter, providerFilter, recommendationFilter, searchTerm]
  )
  const filteredTargets = useMemo(
    () => targets.filter((target) => {
      const matchesSearch = matchesTickerSearch(searchTerm, [
        target.ticker,
        target.companyName,
        target.broker,
        target.status,
      ])
      const matchesStatus = targetStatusFilter === "all" || target.status === targetStatusFilter
      return matchesSearch && matchesStatus
    }),
    [targets, searchTerm, targetStatusFilter]
  )
  const pendingTargets = useMemo(() => targets.filter((target) => target.status === "pending").length, [targets])
  const analyzedTickers = useMemo(() => new Set(analyses.map((analysis) => analysis.ticker)).size, [analyses])
  const comparisonGroups = useMemo(() => {
    const groups = new Map<string, LlmAnalysis[]>()
    filteredAnalyses.forEach((analysis) => {
      const existing = groups.get(analysis.ticker) ?? []
      existing.push(analysis)
      groups.set(analysis.ticker, existing)
    })
    return Array.from(groups.entries())
      .map(([ticker, tickerAnalyses]) => ({
        ticker,
        analyses: tickerAnalyses.sort((left, right) => new Date(right.analysisDate).getTime() - new Date(left.analysisDate).getTime()),
      }))
      .filter((group) => group.analyses.length > 1)
      .slice(0, 6)
  }, [filteredAnalyses])

  return (
    <PageShell>
      <div className="rounded-[2rem] border border-border bg-gradient-to-br from-primary/14 via-white/[0.04] to-background p-5 shadow-[0_20px_80px_rgba(2,6,23,0.2)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Brain className="size-5" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">AI analysis</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Queue tickers for your local Ollama worker, then review saved recommendations and raw model output in one place.
            </p>
            {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadDashboard("refresh")}
            disabled={isRefreshing}
            className="gap-2 rounded-xl border-border bg-muted/40"
          >
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 card-shadow">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Source tickers</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{targets.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{pendingTargets} waiting for analysis</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-shadow">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Analysed</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{analyzedTickers}</p>
          <p className="mt-1 text-xs text-muted-foreground">Distinct symbols with results</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 card-shadow">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Latest run</p>
          <p className="mt-2 truncate text-lg font-semibold tracking-tight">{latestAnalysis?.ticker ?? "None"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{latestAnalysis ? formatDateTime(latestAnalysis.createdAt) : "No analysis saved yet"}</p>
        </div>
      </section>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Analysis filters</CardTitle>
          <CardDescription>Filter saved analysis and the source queue by model, recommendation, provider, date, and target status.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Model</span>
            <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none">
              <option value="all">All models</option>
              {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Recommendation</span>
            <select value={recommendationFilter} onChange={(event) => setRecommendationFilter(event.target.value)} className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none">
              <option value="all">All recommendations</option>
              {recommendationOptions.map((recommendation) => <option key={recommendation} value={recommendation}>{recommendation}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Provider</span>
            <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none">
              <option value="all">All providers</option>
              {providerOptions.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Analysis date</span>
            <input type="date" value={dateFilter === "all" ? "" : dateFilter} onChange={(event) => setDateFilter(event.target.value || "all")} className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Target status</span>
            <select value={targetStatusFilter} onChange={(event) => setTargetStatusFilter(event.target.value as AnalysisTargetStatus | "all")} className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none">
              <option value="all">All targets</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="analyzed">Analyzed</option>
              <option value="paused">Paused</option>
            </select>
          </label>
        </CardContent>
      </Card>

      {comparisonGroups.length > 0 ? (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Recommendation comparison</CardTitle>
            <CardDescription>Recent changes by ticker across dates or models.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {comparisonGroups.map((group) => (
              <div key={group.ticker} className="rounded-lg border border-border bg-card p-4 card-shadow">
                <p className="font-medium">{group.ticker}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.analyses.slice(0, 5).map((analysis) => (
                    <Badge key={analysis.id} variant="outline" className={getRecommendationClassName(analysis.recommendation)}>
                      {formatDate(analysis.analysisDate)} · {analysis.model} · {analysis.recommendation}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Add ticker for AI analysis</CardTitle>
            <CardDescription>This writes to `llm_analysis_targets`, which your worker can use as its source queue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddTarget} className="space-y-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Search holdings or broker instruments</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <input
                    value={tickerSearch}
                    onChange={(event) => setTickerSearch(event.target.value)}
                    placeholder="Search ticker or company..."
                    className="w-full rounded-xl border border-border bg-muted/40 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
                  />
                </div>
                <span className="block text-xs text-muted-foreground">
                  {isSearchingTickers ? "Searching eToro, Trading 212, and synced positions..." : "Pick a result below, or type ticker details manually."}
                </span>
              </label>

              {tickerSearchResults.length > 0 ? (
                <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-border bg-muted/40 p-2">
                  {tickerSearchResults.map((instrument) => {
                    const companyName = getInstrumentCompanyName(instrument)
                    const key = `${instrument.broker}:${instrument.id ?? instrument.ticker}`

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectInstrument(instrument)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">{instrument.ticker}</span>
                          <span className="block truncate text-xs text-muted-foreground">{companyName}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                            {instrument.broker}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatInstrumentPrice(instrument)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : tickerSearch.trim().length >= 2 && !isSearchingTickers ? (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  No matching synced positions or broker instruments found. You can still enter a ticker manually.
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Ticker</span>
                  <input
                    value={newTicker}
                    onChange={(event) => setNewTicker(event.target.value.toUpperCase())}
                    placeholder="RR"
                    className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary/50"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Broker/source</span>
                  <input
                    value={newBroker}
                    onChange={(event) => setNewBroker(event.target.value)}
                    placeholder="etoro"
                    className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary/50"
                  />
                </label>
              </div>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Company name</span>
                <input
                  value={newCompanyName}
                  onChange={(event) => setNewCompanyName(event.target.value)}
                  placeholder="Rolls-Royce Holdings"
                  className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Notes for worker</span>
                <textarea
                  value={newNotes}
                  onChange={(event) => setNewNotes(event.target.value)}
                  placeholder="Optional context for the local analysis service"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary/50"
                />
              </label>
              <Button type="submit" disabled={isAddingTarget} className="w-full gap-2 rounded-xl">
                <Plus className="size-4" />
                {isAddingTarget ? "Adding..." : "Add ticker"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Ticker source table</CardTitle>
                <CardDescription>{filteredTargets.length} shown · worker source: `/api/llm-analysis-targets?status=pending`</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search ticker..."
                  className="w-full rounded-xl border border-border bg-muted/40 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last analysed</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTargets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      {isLoading ? "Loading tickers..." : "No queued tickers match your search."}
                    </TableCell>
                  </TableRow>
                ) : filteredTargets.map((target) => (
                  <TableRow key={target.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{target.ticker}</span>
                        <span className="text-xs text-muted-foreground">{target.companyName || target.broker || "Any source"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusClassName(target.status)}>{target.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {target.lastAnalyzedAt ? formatDateTime(target.lastAnalyzedAt) : "Not yet"}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground">{target.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Saved AI analysis</CardTitle>
              <CardDescription>{filteredAnalyses.length} analysis rows shown. Click a row to show the full analysis.</CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              Results source: `llm_analyses`
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead className="text-right">Analysis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAnalyses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {isLoading ? "Loading analysis..." : "No saved analysis matches your search."}
                  </TableCell>
                </TableRow>
              ) : filteredAnalyses.map((analysis) => {
                const isExpanded = expandedAnalysisId === analysis.id
                const keyReasons = getRawOutputText(analysis.rawOutput, ["keyReasons", "reasons", "summary"])
                const changeView = getRawOutputText(analysis.rawOutput, ["whatWouldChangeView", "changeView"])
                return (
                  <Fragment key={analysis.id}>
                    <TableRow>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{analysis.ticker}</span>
                          <span className="text-xs text-muted-foreground">{analysis.companyName || analysis.broker || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getRecommendationClassName(analysis.recommendation)}>
                          {analysis.recommendation}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs">{analysis.model}</span>
                          <span className="text-xs text-muted-foreground">{analysis.provider}{analysis.horizon ? ` · ${analysis.horizon}` : ""}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(analysis.analysisDate)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatConfidence(analysis.confidence)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(analysis.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedAnalysisId(isExpanded ? null : analysis.id)}
                          className="gap-1 rounded-xl border-border bg-muted/40"
                        >
                          {isExpanded ? "Hide" : "Show"} analysis
                          <ChevronDown className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")} />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow key={`${analysis.id}:expanded`} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={7} className="whitespace-normal p-4">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <DetailBlock title="Key reasons">{keyReasons}</DetailBlock>
                            <DetailBlock title="What would change the view">{changeView}</DetailBlock>
                            <DetailBlock title="Thesis">{analysis.thesis}</DetailBlock>
                            <DetailBlock title="Risks">{analysis.risks}</DetailBlock>
                            <DetailBlock title="Prompt">{analysis.prompt}</DetailBlock>
                            <div className="rounded-lg border border-border bg-card p-4 card-shadow">
                              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Metadata</p>
                              <dl className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                                <div><dt className="text-xs uppercase tracking-[0.16em]">Provider</dt><dd className="mt-0.5 text-foreground">{analysis.provider}</dd></div>
                                <div><dt className="text-xs uppercase tracking-[0.16em]">Model</dt><dd className="mt-0.5 text-foreground">{analysis.model}</dd></div>
                                <div><dt className="text-xs uppercase tracking-[0.16em]">Horizon</dt><dd className="mt-0.5 text-foreground">{analysis.horizon || "—"}</dd></div>
                                <div><dt className="text-xs uppercase tracking-[0.16em]">Updated</dt><dd className="mt-0.5 text-foreground">{formatDateTime(analysis.updatedAt)}</dd></div>
                              </dl>
                            </div>
                          </div>
                          {hasRawOutput(analysis.rawOutput) ? (
                            <details className="mt-4 rounded-xl border border-border bg-background/60 p-4">
                              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Raw model output</summary>
                              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{JSON.stringify(analysis.rawOutput, null, 2)}</pre>
                            </details>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  )
}
