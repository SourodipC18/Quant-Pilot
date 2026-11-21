import type { PaperPortfolio } from './paper-trading-types'

export type PortfolioOption = { id: string; name: string; benchmark: string }
export type PortfolioHolding = { id: string; portfolioId: string; symbol: string; shares: string; averageCost: string | null }
export const PAPER_PORTFOLIO: PortfolioOption = { id: 'paper-simulation', name: 'Trading account', benchmark: 'SPY' }

export function portfolioHoldingsFor(portfolio: PortfolioOption | undefined, saved: PortfolioHolding[] | undefined, paper: PaperPortfolio | undefined): PortfolioHolding[] {
  if (!portfolio) return []
  if (portfolio.id !== PAPER_PORTFOLIO.id) return (saved ?? []).filter(holding => holding.portfolioId === portfolio.id)
  return (paper?.positions ?? []).map(holding => ({ id: `paper:${holding.symbol}`, portfolioId: portfolio.id, symbol: holding.symbol, shares: String(holding.shares), averageCost: String(holding.averageCost) }))
}
