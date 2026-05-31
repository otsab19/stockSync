import { NextResponse } from "next/server"
import { createSyncStatusRepository } from "@/lib/sync/factory"
import type { SyncStatusApiResponse } from "@/types/sync"

export async function GET() {
  const repository = createSyncStatusRepository()
  const response = await repository.getStatus()

  const statusCodeByResponse: Record<SyncStatusApiResponse["status"], number> = {
    ok: 200,
    disabled: 200,
    setup_required: 503,
    unauthorized: 401,
    error: 500,
  }

  return NextResponse.json<SyncStatusApiResponse>(response, {
    status: statusCodeByResponse[response.status],
  })
}

