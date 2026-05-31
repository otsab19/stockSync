import { getConfiguredBackend } from "@/lib/backend/config"
import { SupabaseAlertJobRepository } from "@/lib/alerts/supabase-alert-job"
import { UnsupportedAlertJobRepository } from "@/lib/alerts/unsupported-alert-job"
import type { AlertJobRepository } from "@/lib/alerts/repository"

export function createAlertJobRepository(): AlertJobRepository {
  switch (getConfiguredBackend()) {
    case "browser":
      return new UnsupportedAlertJobRepository()
    case "supabase":
    default:
      return new SupabaseAlertJobRepository()
  }
}

