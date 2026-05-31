import type { AlertJobRepository } from "@/lib/alerts/repository"
import type { AlertJobResult } from "@/types/alerts"

export class UnsupportedAlertJobRepository implements AlertJobRepository {
  async runAlertCheck(): Promise<AlertJobResult> {
    return {
      success: true,
      backend: "browser",
      skipped: true,
      message:
        "Browser mode stores portfolio data locally on the client, so the server-side alert job is skipped. In this mode the app can surface alerts while open, but it cannot send background notifications after the app is closed.",
    }
  }
}

