import { NextResponse } from "next/server"
import { getBrokerProvider } from "@/lib/integrations/factory"
import { getAuthenticatedOrderContext, getBrokerCredentials } from "@/lib/orders/server"
import type { OrderBroker } from "@/types/orders"

export async function GET() {
  const context = await getAuthenticatedOrderContext()
  if ("error" in context) return context.error

  const brokers: OrderBroker[] = ["t212", "etoro"]
  const orders = []
  const errors: string[] = []

  for (const broker of brokers) {
    const credentials = getBrokerCredentials(context.profile ?? null, broker)
    if (!credentials.apiKey?.trim()) continue

    const provider = getBrokerProvider(broker)
    if (!provider?.getPendingOrders) continue

    try {
      const brokerOrders = await provider.getPendingOrders(credentials)
      orders.push(...brokerOrders)
    } catch (error) {
      errors.push(`${broker === "t212" ? "Trading 212" : "eToro"}: ${error instanceof Error ? error.message : "Failed to load pending orders"}`)
    }
  }

  return NextResponse.json({ orders, errors })
}
