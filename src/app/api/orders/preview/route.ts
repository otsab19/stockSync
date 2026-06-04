import { NextResponse } from "next/server"
import { getAuthenticatedOrderContext, getBrokerCredentials, getOrderProviderOrResponse, parseOrderRequest } from "@/lib/orders/server"
import { validateOrderRequest } from "@/lib/orders/validation"

export async function POST(request: Request) {
  const context = await getAuthenticatedOrderContext()
  if ("error" in context) return context.error

  const order = parseOrderRequest(await request.json())
  const providerResult = getOrderProviderOrResponse(order.broker)
  if ("error" in providerResult) return providerResult.error

  const credentials = getBrokerCredentials(context.profile ?? null, order.broker)
  if (!credentials.apiKey || !credentials.apiSecret) {
    return NextResponse.json({ message: "Broker credentials are missing." }, { status: 400 })
  }

  const preview = await providerResult.provider.previewOrder(order, credentials)
  const validation = validateOrderRequest(order)

  return NextResponse.json({
    preview,
    capabilities: providerResult.provider.getOrderCapabilities?.(),
    canSubmit: validation.errors.length === 0,
  })
}
