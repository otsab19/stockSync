"use client"

import { Fragment, useMemo, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CurrencyMode, PortfolioPosition } from "@/types/portfolio"
import { formatMoney, getAlertBadgeVariant, getDisplayCurrency, getDisplayProfit, getDisplayValue } from "@/lib/dashboard/filter-engine"
import { PositionDetailPanel } from "@/components/dashboard/position-detail-panel"

interface PortfolioTableProps {
  portfolio: PortfolioPosition[]
  currencyMode: CurrencyMode
  emptyMessage: string
  isLoading: boolean
  highlightedTicker?: string | null
}

type GroupBy = "none" | "broker" | "assetType" | "alertStatus"

function groupPositions(positions: PortfolioPosition[], groupBy: GroupBy): Map<string, PortfolioPosition[]> {
  if (groupBy === "none") return new Map([["All", positions]])

  const map = new Map<string, PortfolioPosition[]>()
  for (const p of positions) {
    const key = groupBy === "broker" ? p.brokerLabel
      : groupBy === "assetType" ? p.assetType.toUpperCase()
      : p.alertStatus
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return map
}

export function PortfolioTable({ portfolio, currencyMode, emptyMessage, isLoading, highlightedTicker = null }: PortfolioTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const groups = useMemo(() => groupPositions(portfolio, groupBy), [portfolio, groupBy])

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Card className="border-white/10">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-base">Holdings ({portfolio.length})</CardTitle>
        <select
          value={groupBy}
          onChange={(e) => {
            setGroupBy(e.target.value as GroupBy)
            setExpandedId(null)
            setCollapsedGroups(new Set())
          }}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs outline-none"
        >
          <option value="none">No grouping</option>
          <option value="broker">Group by broker</option>
          <option value="assetType">Group by type</option>
          <option value="alertStatus">Group by alert</option>
        </select>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="min-w-[140px]">Ticker</TableHead>
                <TableHead className="min-w-[90px]">Broker</TableHead>
                <TableHead className="min-w-[70px] text-right">Shares</TableHead>
                <TableHead className="min-w-[90px] text-right">Avg Cost</TableHead>
                <TableHead className="min-w-[90px] text-right">Price</TableHead>
                <TableHead className="min-w-[100px] text-right">Value</TableHead>
                <TableHead className="min-w-[90px] text-right">P/L</TableHead>
                <TableHead className="min-w-[80px]">Alert</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : portfolio.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                Array.from(groups.entries()).map(([groupKey, positions]) => (
                  <Fragment key={groupKey}>
                    {groupBy !== "none" && (
                      <TableRow
                        className="cursor-pointer bg-white/[0.02] hover:bg-white/[0.04]"
                        onClick={() => toggleGroup(groupKey)}
                      >
                        <TableCell colSpan={8} className="py-2">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {collapsedGroups.has(groupKey)
                              ? <ChevronRight className="size-3.5" />
                              : <ChevronDown className="size-3.5" />
                            }
                            {groupKey} ({positions.length})
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {!collapsedGroups.has(groupKey) && positions.map((position) => {
                      const expanded = expandedId === position.id
                      const displayCurrency = getDisplayCurrency(position, currencyMode)

                      return (
                        <Fragment key={position.id}>
                          <TableRow
                            className={`cursor-pointer ${highlightedTicker === position.ticker ? "bg-emerald-500/10" : ""}`}
                            onClick={() => setExpandedId(expanded ? null : position.id)}
                          >
                            <TableCell>
                              <div>
                                <span className="font-medium">{position.ticker}</span>
                                {position.externalPositionId?.startsWith("position:") ? (
                                  <span className="ml-1.5 text-[0.6rem] text-muted-foreground">lot {position.externalPositionId.replace("position:", "")}</span>
                                ) : null}
                                <span className="ml-1.5 text-[0.65rem] text-muted-foreground">{position.companyName}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">{position.brokerLabel}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{position.shares}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(position.avgPrice, displayCurrency)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(position.livePrice, displayCurrency)}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{formatMoney(getDisplayValue(position, currencyMode), displayCurrency)}</TableCell>
                            <TableCell className={`text-right font-medium tabular-nums ${position.totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {position.totalPL >= 0 ? "+" : ""}{formatMoney(getDisplayProfit(position, currencyMode), displayCurrency)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={getAlertBadgeVariant(position.alertStatus)} className="text-[0.6rem]">
                                {position.alertStatus === "near-alert" ? "⚠️" : position.alertStatus === "triggered" ? "🔴" : "✓"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          {expanded && (
                            <TableRow>
                              <TableCell colSpan={8} className="p-0">
                                <AnimatePresence initial={false}>
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <PositionDetailPanel position={position} />
                                  </motion.div>
                                </AnimatePresence>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
