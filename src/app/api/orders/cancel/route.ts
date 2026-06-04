import { NextResponse } from "next/server"
import { getAuthenticatedOrderContext, getBrokerCredentials, getOrderProviderOrResponse, mapOrderRow, toSerializableJson, updateUserOrderRequest } from "@/lib/orders/server"
import type { OrderBroker } from "@/types/orders"

export async function POST(request: Request) {
  const context = await getAuthenticatedOrderContext()
  if ("error" in context) return context.error

  const body = await request.json() as { id?: string; broker?: OrderBroker; brokerOrderId?: string }
  if (!body.id || !body.brokerOrderId || !body.broker) {
    return NextResponse.json({ message: "id, broker, and brokerOrderId are required." }, { status: 400 })
  }

  const providerResult = getOrderProviderOrResponse(body.broker)
  if ("error" in providerResult) return providerResult.error
  if (!providerResult.provider.cancelOrder) {
    return NextResponse.json({ message: "This broker does not support cancellation from StockSync yet." }, { status: 400 })
  }

  const credentials = getBrokerCredentials(context.profile ?? null, body.broker)
  const result = await providerResult.provider.cancelOrder(body.brokerOrderId, credentials)
  const { data, error } = await updateUserOrderRequest(context.supabase, body.id, context.user.id, {
      status: "cancelled",
      raw_response: toSerializableJson(result.rawResponse),
      updated_at: new Date().toISOString(),
    })

  if (error || !data) {
    return NextResponse.json({ message: error?.message ?? "Failed to update cancelled order." }, { status: 500 })
  }

  return NextResponse.json({ order: mapOrderRow(data) })
}
