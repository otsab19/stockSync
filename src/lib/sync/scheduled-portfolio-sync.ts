import { getBrokerProvider } from "@/lib/integrations/factory"
import { recordBrokerSync, recordBrokerSyncFailure, type SupabaseWriter } from "@/lib/sync/record-broker-sync"
import { createServiceRoleClient } from "@/utils/supabase/server"

type ScheduledConnectionRow = {
  user_id: string
  broker: "t212" | "etoro"
  sync_mode: "manual" | "scheduled"
}

type ProfileRow = {
  id: string
  t212_api_key: string | null
  t212_api_secret: string | null
  etoro_api_key: string | null
  etoro_api_secret: string | null
}

export async function runScheduledPortfolioSync() {
  const supabase = createServiceRoleClient()
  if (!supabase) {
    return {
      success: false,
      message: "Supabase service role is not configured.",
      synced: 0,
      errors: [] as string[],
    }
  }

  const { data: connections, error } = await supabase
    .from("broker_connections")
    .select("user_id, broker, sync_mode")
    .eq("is_enabled", true)
    .eq("sync_mode", "scheduled") as unknown as { data: ScheduledConnectionRow[] | null; error: Error | null }

  if (error) {
    return {
      success: false,
      message: error.message,
      synced: 0,
      errors: [error.message],
    }
  }

  const writer = supabase as unknown as SupabaseWriter
  const errors: string[] = []
  let synced = 0

  for (const connection of connections ?? []) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, t212_api_key, t212_api_secret, etoro_api_key, etoro_api_secret")
      .eq("id", connection.user_id)
      .single() as unknown as { data: ProfileRow | null }

    if (!profile) continue

    const apiKey = connection.broker === "t212" ? profile.t212_api_key : profile.etoro_api_key
    const apiSecret = connection.broker === "t212" ? profile.t212_api_secret : profile.etoro_api_secret
    if (!apiKey || !apiSecret) continue

    const provider = getBrokerProvider(connection.broker)
    if (!provider) continue

    try {
      const syncData = provider.getSyncData
        ? await provider.getSyncData({ apiKey, apiSecret })
        : { positions: await provider.getPositions({ apiKey, apiSecret }), activity: undefined }

      await recordBrokerSync(writer, connection.user_id, connection.broker, syncData.positions, syncData.activity, {
        accountSnapshot: syncData.accountSnapshot ?? null,
        syncStats: syncData.syncStats ?? {
          positionsMapped: syncData.positions.length,
          positionsStored: syncData.positions.length,
          activityImported: syncData.activity?.length ?? 0,
        },
        syncMode: "scheduled",
        trigger: "scheduled",
      })
      synced += 1
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Scheduled sync failed."
      errors.push(`${connection.user_id}/${connection.broker}: ${message}`)
      await recordBrokerSyncFailure(writer, connection.user_id, connection.broker, syncError, {
        syncMode: "scheduled",
        trigger: "scheduled",
      })
    }
  }

  return {
    success: errors.length === 0,
    message: `Scheduled portfolio sync completed for ${synced} broker connection${synced === 1 ? "" : "s"}.`,
    synced,
    errors,
  }
}
