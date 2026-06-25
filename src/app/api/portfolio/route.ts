import { NextResponse } from 'next/server';
import { getBrokerProvider } from '@/lib/integrations/factory';
import { fetchTrading212AccountSummaryFromApi } from '@/lib/integrations/trading212-live';
import { createClient } from '@/utils/supabase/server';
import { getConfiguredBackend } from '@/lib/backend/config';
import { recordBrokerSync, recordBrokerSyncFailure, type SupabaseWriter } from '@/lib/sync/record-broker-sync';
import type { PortfolioApiResponse } from '@/types/portfolio';
import { createServerPortfolioRepository } from '@/lib/portfolio/server-factory';

type ProfileRow = {
  t212_api_key: string | null
  t212_api_secret: string | null
  etoro_api_key: string | null
  etoro_api_secret: string | null
}

async function refreshSupabaseBrokerData(includeActivity: boolean) {
  if (getConfiguredBackend() !== "supabase") return

  const supabase = await createClient()
  if (!supabase) return

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from("profiles")
    .select("t212_api_key, t212_api_secret, etoro_api_key, etoro_api_secret")
    .eq("id", user.id)
    .single() as unknown as { data: ProfileRow | null }

  const writer = supabase as unknown as SupabaseWriter

  for (const broker of ["t212", "etoro"] as const) {
    const apiKey = broker === "t212" ? profile?.t212_api_key : profile?.etoro_api_key
    const apiSecret = broker === "t212" ? profile?.t212_api_secret : profile?.etoro_api_secret
    if (!apiKey || !apiSecret) continue

    const provider = getBrokerProvider(broker)
    if (!provider) continue

    try {
      const credentials = { apiKey, apiSecret }
      let syncData

      if (includeActivity && provider.getSyncData) {
        syncData = await provider.getSyncData(credentials)
      } else {
        const positions = await provider.getPositions(credentials)
        const accountSnapshot = broker === "t212"
          ? await fetchTrading212AccountSummaryFromApi(credentials)
          : null

        syncData = {
          positions,
          activity: undefined,
          accountSnapshot,
          syncStats: {
            positionsMapped: positions.length,
            positionsStored: positions.length,
            activityImported: 0,
          },
        }
      }

      await recordBrokerSync(writer, user.id, broker, syncData.positions, syncData.activity, {
        accountSnapshot: syncData.accountSnapshot ?? null,
        syncStats: syncData.syncStats ?? {
          positionsMapped: syncData.positions.length,
          positionsStored: syncData.positions.length,
          activityImported: syncData.activity?.length ?? 0,
        },
        syncMode: "manual",
        trigger: "manual",
      })
    } catch (error) {
      await recordBrokerSyncFailure(writer, user.id, broker, error, {
        syncMode: "manual",
        trigger: "manual",
      })
    }
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get("refresh") === "true") {
    try {
      await refreshSupabaseBrokerData(url.searchParams.get("includeActivity") === "true")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh broker data."
      return NextResponse.json<PortfolioApiResponse>({
        status: "error",
        backend: "supabase",
        source: "server",
        portfolio: [],
        insights: null,
        message,
      }, { status: 500 })
    }
  }

  const repository = createServerPortfolioRepository()
  const response = await repository.getPortfolio()

  const statusCodeByResponse: Record<PortfolioApiResponse["status"], number> = {
    ok: 200,
    client_only: 200,
    setup_required: 503,
    unauthorized: 401,
    error: 500,
  }

  return NextResponse.json<PortfolioApiResponse>(response, {
    status: statusCodeByResponse[response.status],
  })
}
