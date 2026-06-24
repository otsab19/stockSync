import { NextResponse } from "next/server"
import { getAuthenticatedOrderContext, getBrokerCredentials, getOrderProviderOrResponse } from "@/lib/orders/server"
import type { OrderBroker } from "@/types/orders"
import type { PendingOrderCancelKind } from "@/types/pending-orders"

export async function POST(request: Request) {
  const context = await getAuthenticatedOrderContext()
  if ("error" in context) return context.error

  const body = await request.json() as {
    broker?: OrderBroker
    brokerOrderId?: string
    cancelKind?: PendingOrderCancelKind
  }

  if (!body.broker || !body.brokerOrderId) {
    return NextResponse.json({ message: "broker and brokerOrderId are required." }, { status: 400 })
  }

  const providerResult = getOrderProviderOrResponse(body.broker)
  if ("error" in providerResult) return providerResult.error
  if (!providerResult.provider.cancelOrder) {
    return NextResponse.json({ message: "This broker does not support cancellation from StockSync yet." }, { status: 400 })
  }

  const credentials = getBrokerCredentials(context.profile ?? null, body.broker)
  const result = await providerResult.provider.cancelOrder(body.brokerOrderId, credentials, {
    cancelKind: body.cancelKind,
  })

  return NextResponse.json({ result })
}
