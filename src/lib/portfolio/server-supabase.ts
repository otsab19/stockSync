import { createClient, getSupabaseSetupMessage } from "@/utils/supabase/server"
import type { PortfolioApiResponse, PortfolioActivityEvent, PortfolioPosition } from "@/types/portfolio"
import type { ServerPortfolioRepository } from "@/lib/portfolio/repository"
import { getBrokerProvider } from "@/lib/integrations/factory"
import { createFailurePortfolioResponse, createSuccessPortfolioResponse } from "@/lib/dashboard/portfolio-response"

type ProfileKeys = {
  t212_api_key: string | null
  t212_api_secret: string | null
  etoro_api_key: string | null
  etoro_api_secret: string | null
}

export class SupabaseServerPortfolioRepository implements ServerPortfolioRepository {
  async getPortfolio(): Promise<PortfolioApiResponse> {
    const supabase = await createClient()

    if (!supabase) {
      return createFailurePortfolioResponse("setup_required", "supabase", "server", getSupabaseSetupMessage())
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return createFailurePortfolioResponse(
        "unauthorized",
        "supabase",
        "server",
        "Sign in with Supabase to load your portfolio data."
      )
    }

    const profileResponse = await supabase
      .from("profiles")
      .select("t212_api_key, t212_api_secret, etoro_api_key, etoro_api_secret")
      .filter("id", "eq", user.id)
      .single()

    const profile = profileResponse.data as unknown as ProfileKeys | null

    if (profileResponse.error) {
      return createFailurePortfolioResponse(
        "error",
        "supabase",
        "server",
        "Failed to load broker API keys from the profiles table."
      )
    }

    const portfolio: PortfolioPosition[] = []
    const activity: PortfolioActivityEvent[] = []
    const messages: string[] = []

    if (profile?.t212_api_key) {
      const provider = getBrokerProvider("t212")
      if (provider) {
        const credentials = { apiKey: profile.t212_api_key, apiSecret: profile.t212_api_secret ?? "" }
        if (provider.getSyncData) {
          const result = await provider.getSyncData(credentials)
          portfolio.push(...result.positions)
          if (result.activity) activity.push(...result.activity)
          if (result.message) messages.push(result.message)
        } else {
          portfolio.push(...(await provider.getPositions(credentials)))
        }
      }
    }

    if (profile?.etoro_api_key) {
      const provider = getBrokerProvider("etoro")
      if (provider) {
        const credentials = { apiKey: profile.etoro_api_key, apiSecret: profile.etoro_api_secret ?? "" }
        if (provider.getSyncData) {
          const result = await provider.getSyncData(credentials)
          portfolio.push(...result.positions)
          if (result.activity) activity.push(...result.activity)
          if (result.message) messages.push(result.message)
        } else {
          portfolio.push(...(await provider.getPositions(credentials)))
        }
      }
    }

    const message = portfolio.length === 0
      ? "Add at least one broker API key in your profile to see positions."
      : messages.length > 0
        ? messages.join(" ")
        : undefined

    return createSuccessPortfolioResponse(
      portfolio,
      "supabase",
      "server",
      message,
      {
        sourceKind: "api_sync",
        lastSyncedAt: new Date().toISOString(),
        syncMode: "manual",
      },
      activity
    )
  }
}
