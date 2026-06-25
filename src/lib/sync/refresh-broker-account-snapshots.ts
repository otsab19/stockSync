import { fetchTrading212AccountSummaryFromApi } from "@/lib/integrations/trading212-live"
import type { BrokerAccountSnapshot } from "@/types/broker-account"
import type { SupabaseWriter } from "@/lib/sync/record-broker-sync"

type BrokerConnectionSnapshotFields = {
  broker: "t212" | "etoro"
  source_type: "manual_csv" | "broker_api"
  account_currency: string | null
  available_cash: number | string | null
  invested_amount: number | string | null
  total_equity: number | string | null
  holdings_value: number | string | null
  unrealized_pl: number | string | null
  realized_pl: number | string | null
}

type ProfileCredentials = {
  t212_api_key: string | null
  t212_api_secret: string | null
}

function snapshotToConnectionPatch(snapshot: BrokerAccountSnapshot) {
  return {
    account_currency: snapshot.currency,
    available_cash: snapshot.availableCash,
    invested_amount: snapshot.investedAmount,
    total_equity: snapshot.totalEquity,
    holdings_value: snapshot.holdingsValue,
    unrealized_pl: snapshot.unrealizedPl,
    realized_pl: snapshot.realizedPl ?? null,
    updated_at: new Date().toISOString(),
  }
}

export async function refreshMissingBrokerAccountSnapshots<T extends BrokerConnectionSnapshotFields>(
  writer: SupabaseWriter,
  userId: string,
  profile: ProfileCredentials | null,
  connections: T[]
): Promise<T[]> {
  const nextConnections = [...connections]

  for (let index = 0; index < nextConnections.length; index += 1) {
    const connection = nextConnections[index]!
    if (connection.source_type !== "broker_api" || connection.broker !== "t212") {
      continue
    }

    if (connection.realized_pl !== null) {
      continue
    }

    const apiKey = profile?.t212_api_key?.trim()
    const apiSecret = profile?.t212_api_secret?.trim()
    if (!apiKey || !apiSecret) {
      continue
    }

    const snapshot = await fetchTrading212AccountSummaryFromApi({ apiKey, apiSecret })
    if (!snapshot) {
      continue
    }

    const patch = snapshotToConnectionPatch(snapshot)
    await writer.from("broker_connections")
      .upsert({
        user_id: userId,
        broker: "t212",
        source_type: "broker_api",
        ...patch,
      }, { onConflict: "user_id,broker,source_type" })

    nextConnections[index] = {
      ...connection,
      account_currency: patch.account_currency ?? connection.account_currency,
      available_cash: patch.available_cash ?? connection.available_cash,
      invested_amount: patch.invested_amount ?? connection.invested_amount,
      total_equity: patch.total_equity ?? connection.total_equity,
      holdings_value: patch.holdings_value ?? connection.holdings_value,
      unrealized_pl: patch.unrealized_pl ?? connection.unrealized_pl,
      realized_pl: patch.realized_pl ?? connection.realized_pl,
    } as T
  }

  return nextConnections
}
