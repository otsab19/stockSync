"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CurrencyMode, PortfolioPosition } from "@/types/portfolio"
import { formatMoney, getAlertBadgeVariant, getDisplayCurrency, getDisplayProfit, getDisplayValue } from "@/lib/dashboard/filter-engine"

interface PortfolioTableProps {
  portfolio: PortfolioPosition[]
  currencyMode: CurrencyMode
  emptyMessage: string
  isLoading: boolean
  highlightedTicker?: string | null
}

export function PortfolioTable({ portfolio, currencyMode, emptyMessage, isLoading, highlightedTicker = null }: PortfolioTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 7

  const totalPages = Math.max(1, Math.ceil(portfolio.length / pageSize))
  const pagedPortfolio = useMemo(
    () => portfolio.slice((page - 1) * pageSize, page * pageSize),
    [page, portfolio]
  )
  const pageStart = portfolio.length === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(portfolio.length, page * pageSize)

  useEffect(() => {
    setPage(1)
    setExpandedId(null)
  }, [portfolio])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  return (
    <Card className="border-white/10">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Holdings</CardTitle>
          <CardDescription>Current positions loaded in the dashboard.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{portfolio.length} total</Badge>
          {portfolio.length > 0 ? <Badge variant="outline">Showing {pageStart}-{pageEnd}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Broker</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Avg. Cost</TableHead>
              <TableHead className="text-right">Live Price</TableHead>
              <TableHead className="text-right">Total Value</TableHead>
              <TableHead className="text-right">Total P/L</TableHead>
              <TableHead>Alert Status</TableHead>
              <TableHead className="text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Loading portfolio data...
                </TableCell>
              </TableRow>
            ) : portfolio.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              pagedPortfolio.map((position) => {
                const expanded = expandedId === position.id
                const displayCurrency = getDisplayCurrency(position, currencyMode)

                return (
                  <Fragment key={position.id}>
                    <TableRow
                      aria-expanded={expanded}
                      className={`cursor-pointer ${highlightedTicker === position.ticker ? "bg-emerald-500/10" : ""}`}
                      onClick={() => setExpandedId(expanded ? null : position.id)}
                    >
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{position.ticker}</span>
                            <Badge variant="ghost" className="h-5 border border-white/8 bg-white/[0.03] px-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
                              {position.assetType}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{position.companyName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{position.brokerLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{position.shares}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(position.avgPrice, displayCurrency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(position.livePrice, displayCurrency)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(getDisplayValue(position, currencyMode), displayCurrency)}</TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${position.totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {position.totalPL >= 0 ? "+" : ""}
                        {formatMoney(getDisplayProfit(position, currencyMode), displayCurrency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getAlertBadgeVariant(position.alertStatus)}>
                          {position.alertStatus === "near-alert"
                            ? "Near Alert ⚠️"
                            : position.alertStatus === "triggered"
                              ? "Triggered"
                              : "Stable"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          Details
                          <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </span>
                      </TableCell>
                    </TableRow>
                    <TableRow key={`${position.id}-expanded`}>
                      <TableCell colSpan={9} className="p-0">
                        <AnimatePresence initial={false}>
                          {expanded ? (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="grid gap-4 border-t border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-muted-foreground lg:grid-cols-[1.2fr_1fr]">
                                <div className="space-y-2 rounded-2xl border border-white/8 bg-background/30 p-4">
                                  <p className="font-medium text-foreground">Position details</p>
                                  <p>• Alert threshold gap: £{position.alertDelta.toFixed(2)}</p>
                                  <p>• Asset type: {position.assetType.toUpperCase()}</p>
                                  <p>• Broker: {position.brokerLabel}</p>
                                  <p>• Recent change: {position.recentChange >= 0 ? "+" : ""}{position.recentChange.toFixed(2)}%</p>
                                </div>
                                <div className="space-y-2 rounded-2xl border border-white/8 bg-background/30 p-4">
                                  <p className="font-medium text-foreground">Value snapshot</p>
                                  <div className="rounded-xl border border-white/8 bg-background/50 px-3 py-3 text-xs">
                                    <p>Total value: {formatMoney(getDisplayValue(position, currencyMode), displayCurrency)}</p>
                                    <p>Total P/L: {position.totalPL >= 0 ? "+" : ""}{formatMoney(getDisplayProfit(position, currencyMode), displayCurrency)}</p>
                                    <p>Live price: {formatMoney(position.livePrice, displayCurrency)}</p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

