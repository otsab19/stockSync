import type { PortfolioApiResponse } from "@/types/portfolio"

export type ClientPortfolioRequestOptions = {
  refresh?: boolean
  includeActivity?: boolean
  preferCache?: boolean
}

export interface ClientPortfolioRepository {
  getPortfolio(options?: ClientPortfolioRequestOptions): Promise<PortfolioApiResponse>
}

export interface ServerPortfolioRepository {
  getPortfolio(): Promise<PortfolioApiResponse>
}

