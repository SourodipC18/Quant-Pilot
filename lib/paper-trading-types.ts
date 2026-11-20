import type { PaperCosts, PaperSide } from './paper-trading-math'

const stockTypes = new Set(['common stock', 'preferred stock', 'stock', 'etf', 'exchange traded fund'])
export const eligiblePaperType = (type: unknown) => typeof type === 'string' && stockTypes.has(type.trim().toLowerCase())

export type PaperQuote = { symbol: string; price: number; date: string; source: 'Twelve Data'; freshness: 'End-of-day'; currency: 'USD' }
export type PaperFill = {
  id: string; createdAt: string; symbol: string; side: PaperSide; shares: number; fillPrice: number; referencePrice: number;
  notional: number; commission: number; slippageBps: number; realized: number | null; markDate: string;
}
export type PaperHolding = { symbol: string; shares: number; averageCost: number }
export type PaperPortfolio = { accountId: string; cash: number; equity: number; positions: PaperHolding[] }
export type PaperAccount = Omit<PaperPortfolio, 'positions'> & {
  startingCash: number; costs: PaperCosts; marketValue: number; invested: number; buyingPower: number;
  realized: number; unrealized: number; totalReturn: number; completedTrades: number;
  positions: (PaperHolding & { mark: number; markDate: string; marketValue: number; unrealized: number })[];
  trades: PaperFill[]; history: { date: string; equity: number; realized: number; unrealized: number; pnl: number }[];
}
export type PaperComparison = { accountId: string; cash: number; equity: number; investedValue: number; positions: { symbol: string; marketValue: number; markDate: string }[] }
export type PaperBasketReview = {
  ticket: string; expiresAt: number; budget: number; totalDebit: number; commission: number; slippage: number; remainingCash: number;
  orders: Omit<PaperReview, 'ticket' | 'expiresAt' | 'side'>[];
}
export type PaperBasketResult = { fills: PaperFill[] }

export type PaperReview = {
  ticket: string; expiresAt: number; side: PaperSide; shares: number; fillPrice: number;
  notional: number; commission: number; cashChange: number; quote: PaperQuote;
}
