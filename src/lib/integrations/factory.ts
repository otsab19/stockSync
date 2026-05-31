import { etoroProvider } from "@/lib/integrations/etoro"
import type { BrokerProvider } from "@/lib/integrations/provider"
import { trading212Provider } from "@/lib/integrations/trading212"

const providersById: Record<string, BrokerProvider> = {
  [trading212Provider.id]: trading212Provider,
  [etoroProvider.id]: etoroProvider,
}

export function getBrokerProvider(id: string): BrokerProvider | null {
  return providersById[id] ?? null
}

export function getBrokerProviders(): BrokerProvider[] {
  return Object.values(providersById)
}

