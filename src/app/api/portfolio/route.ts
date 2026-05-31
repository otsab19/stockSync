import { NextResponse } from 'next/server';
import type { PortfolioApiResponse } from '@/types/portfolio';
import { createServerPortfolioRepository } from '@/lib/portfolio/server-factory';

export async function GET() {
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
