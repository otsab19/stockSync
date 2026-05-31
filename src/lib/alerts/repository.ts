import type { AlertJobResult } from "@/types/alerts"

export interface AlertJobRepository {
  runAlertCheck(): Promise<AlertJobResult>
}

