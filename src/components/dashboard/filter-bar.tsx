"use client"

import { useEffect, useState } from "react"
import { Search, SlidersHorizontal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { AssetType, BrokerId, CurrencyMode } from "@/types/portfolio"
import { defaultFilterState, type FilterState } from "@/lib/dashboard/filter-engine"

interface FilterBarProps {
  filters: FilterState
  availableBrokers: Array<{ broker: BrokerId; label: string }>
  resultCount: number
  totalCount: number
  onFiltersChange: (next: FilterState) => void
}

const plFilters: FilterState["plStatus"][] = ["all", "profitable", "unprofitable", "near-alert", "top-gainers", "top-losers"]
const sortByOptions: FilterState["sortBy"][] = ["value", "pl_absolute", "pl_percentage", "ticker"]
const currencyModes: CurrencyMode[] = ["native", "normalized_gbp"]
const assetTypes: Array<"all" | AssetType> = ["all", "stock", "etf", "crypto"]
const fieldClasses = "w-full rounded-2xl border border-white/10 bg-background/45 px-4 py-3 text-sm outline-none transition focus:border-primary/30"

const plFilterLabels: Record<FilterState["plStatus"], string> = {
  all: "All P/L",
  profitable: "Profitable",
  unprofitable: "Loss-making",
  "near-alert": "Near alert",
  "top-gainers": "Up today",
  "top-losers": "Down today",
}

const sortLabels: Record<FilterState["sortBy"], string> = {
  value: "Value",
  pl_absolute: "P/L amount",
  pl_percentage: "P/L %",
  ticker: "Ticker",
}

function hasActiveFilters(filters: FilterState) {
  return (
    filters.searchQuery.trim().length > 0
    || filters.brokers.length > 0
    || filters.plStatus !== "all"
    || filters.assetType !== "all"
    || filters.sortBy !== defaultFilterState.sortBy
    || filters.sortOrder !== defaultFilterState.sortOrder
    || filters.currencyMode !== defaultFilterState.currencyMode
  )
}

export function FilterBar({ filters, availableBrokers, resultCount, totalCount, onFiltersChange }: FilterBarProps) {
  const [isCommandOpen, setIsCommandOpen] = useState(false)
  const activeFilters = hasActiveFilters(filters)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setIsCommandOpen((current) => !current)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  const toggleBroker = (broker: BrokerId) => {
    const nextBrokers = filters.brokers.includes(broker)
      ? filters.brokers.filter((entry) => entry !== broker)
      : [...filters.brokers, broker]

    onFiltersChange({ ...filters, brokers: nextBrokers })
  }

  return (
    <Card className="border-white/10">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Filter holdings</CardTitle>
          <CardDescription>
            Showing {resultCount} of {totalCount} holding{totalCount === 1 ? "" : "s"}. Search, sort, and focus the dashboard.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters ? (
            <Button variant="ghost" size="sm" onClick={() => onFiltersChange(defaultFilterState)}>
              Reset filters
            </Button>
          ) : null}
          <Dialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
            <DialogTrigger render={<Button variant="outline" className="gap-2 rounded-xl border-white/10 bg-white/[0.03]" />}>
              <Search className="size-4" />
              Search positions
              <span className="ml-2 rounded-md border border-white/10 px-2 py-0.5 text-[0.7rem] text-muted-foreground">⌘K</span>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Command search</DialogTitle>
                <DialogDescription>
                  Search instantly by ticker symbol or company name.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <label className="text-sm font-medium">Search query</label>
                <input
                  value={filters.searchQuery}
                  onChange={(event) => onFiltersChange({ ...filters, searchQuery: event.target.value })}
                  placeholder="Try AAPL or Apple Inc."
                  className={fieldClasses}
                />
                <p className="text-xs text-muted-foreground">
                  Search by ticker or company name.
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters ? (
            <>
              {filters.searchQuery.trim() ? <Badge variant="outline">Search: {filters.searchQuery.trim()}</Badge> : null}
              {filters.plStatus !== "all" ? <Badge variant="outline">P/L: {plFilterLabels[filters.plStatus]}</Badge> : null}
              {filters.assetType !== "all" ? <Badge variant="outline">Type: {filters.assetType.toUpperCase()}</Badge> : null}
              {filters.brokers.map((broker) => (
                <Badge key={broker} variant="outline">Broker: {availableBrokers.find((entry) => entry.broker === broker)?.label ?? broker}</Badge>
              ))}
              {filters.currencyMode !== defaultFilterState.currencyMode ? (
                <Badge variant="outline">Currency: {filters.currencyMode === "native" ? "Native" : "GBP"}</Badge>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">All positions are visible. Use filters to tighten the table and charts.</p>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Quick search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filters.searchQuery}
                onChange={(event) => onFiltersChange({ ...filters, searchQuery: event.target.value })}
                placeholder="Search by ticker or company"
                className={`${fieldClasses} pr-4 pl-10`}
              />
            </div>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">P/L</span>
            <select
              value={filters.plStatus}
              onChange={(event) => onFiltersChange({ ...filters, plStatus: event.target.value as FilterState["plStatus"] })}
              className={fieldClasses}
            >
              {plFilters.map((value) => (
                <option key={value} value={value}>
                  {plFilterLabels[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Sort by</span>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                value={filters.sortBy}
                onChange={(event) => onFiltersChange({ ...filters, sortBy: event.target.value as FilterState["sortBy"] })}
                className={fieldClasses}
              >
                {sortByOptions.map((value) => (
                  <option key={value} value={value}>
                    {sortLabels[value]}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                className="rounded-2xl border-white/10 bg-white/[0.03]"
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    sortOrder: filters.sortOrder === "asc" ? "desc" : "asc",
                  })
                }
              >
                {filters.sortOrder.toUpperCase()}
              </Button>
            </div>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Currency mode</span>
            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              {currencyModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onFiltersChange({ ...filters, currencyMode: mode })}
                  className={
                    filters.currencyMode === mode
                      ? "rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      : "rounded-xl px-3 py-2 text-sm text-muted-foreground"
                  }
                >
                  {mode === "native" ? "Native" : "GBP"}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            Brokers
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={filters.brokers.length === 0 ? "default" : "outline"}
              onClick={() => onFiltersChange({ ...filters, brokers: [] })}
            >
              All
            </Button>
            {availableBrokers.map((entry) => (
              <Button
                key={entry.broker}
                size="sm"
                variant={filters.brokers.includes(entry.broker) ? "default" : "outline"}
                onClick={() => toggleBroker(entry.broker)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Asset type</div>
          <div className="flex flex-wrap gap-2">
            {assetTypes.map((assetType) => (
              <Button
                key={assetType}
                size="sm"
                variant={filters.assetType === assetType ? "default" : "outline"}
                onClick={() => onFiltersChange({ ...filters, assetType })}
              >
                {assetType === "all" ? "All types" : assetType.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

