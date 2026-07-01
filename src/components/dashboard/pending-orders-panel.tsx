"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMoney } from "@/lib/dashboard/filter-engine"
import type { PendingBrokerOrder } from "@/types/pending-orders"

function formatOrderType(order: PendingBrokerOrder) {
  if (order.orderType === "unknown") return "Order"
  return order.orderType.replace("_", " ")
}

export function PendingOrdersPanel() {
  const [orders, setOrders] = useState<PendingBrokerOrder[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    setIsLoading(true)
    setMessage(null)
    try {
      const response = await fetch("/api/orders/pending", { cache: "no-store" })
      const data = await response.json() as { orders?: PendingBrokerOrder[]; errors?: string[]; message?: string }
      if (!response.ok) throw new Error(data.message ?? "Failed to load pending orders.")
      setOrders(data.orders ?? [])
      setErrors(data.errors ?? [])
    } catch (error) {
      setOrders([])
      setErrors([])
      setMessage(error instanceof Error ? error.message : "Failed to load pending orders.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  const cancelOrder = async (order: PendingBrokerOrder) => {
    setCancellingId(order.brokerOrderId)
    setMessage(null)
    try {
      const response = await fetch("/api/orders/cancel-broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broker: order.broker,
          brokerOrderId: order.brokerOrderId,
          cancelKind: order.cancelKind,
        }),
      })
      const data = await response.json() as { message?: string }
      if (!response.ok) throw new Error(data.message ?? "Cancel failed.")
      setMessage(`Cancelled ${order.ticker} on ${order.brokerLabel}.`)
      await loadOrders()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancel failed.")
    } finally {
      setCancellingId(null)
    }
  }

  if (!isLoading && orders.length === 0 && errors.length === 0 && !message) {
    return null
  }

  return (
    <Card className="border-border bg-muted/40">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">Pending orders</CardTitle>
          <CardDescription>Live broker queue across connected accounts.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadOrders()} disabled={isLoading} className="rounded-xl border-border bg-muted/40">
          <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 p-0 pb-4">
        {message ? <p className="px-4 text-sm text-muted-foreground">{message}</p> : null}
        {errors.map((error) => (
          <p key={error} className="px-4 text-sm text-amber-400">{error}</p>
        ))}
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading pending orders...</p>
        ) : orders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No pending orders right now.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Broker</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={`${order.broker}-${order.brokerOrderId}`}>
                  <TableCell className="font-medium">{order.ticker}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{order.brokerLabel}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={order.side === "buy" ? "border-emerald-500/20 text-emerald-400" : "border-red-500/20 text-red-400"}>
                      {order.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{formatOrderType(order)}</TableCell>
                  <TableCell className="text-right tabular-nums">{order.quantity ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {order.limitPrice !== null ? formatMoney(order.limitPrice, "GBP") : order.stopPrice !== null ? formatMoney(order.stopPrice, "GBP") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-border"
                      disabled={cancellingId === order.brokerOrderId}
                      onClick={() => void cancelOrder(order)}
                    >
                      <XCircle className="size-3.5" />
                      Cancel
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
