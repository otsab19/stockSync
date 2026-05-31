import type { PortfolioApiResponse } from "@/types/portfolio"
import type { ServerPortfolioRepository } from "@/lib/portfolio/repository"

export class UnsupportedServerPortfolioRepository implements ServerPortfolioRepository {
  async getPortfolio(): Promise<PortfolioApiResponse> {
    return {
      status: "client_only",
      portfolio: [],
      insights: null,
      backend: "browser",
      source: "server",
      message:
        "Browser mode stores portfolio data locally on the client, so this server route does not own portfolio data in that mode.",
    }
  }
}

