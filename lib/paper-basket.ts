import { estimateOrder, marketValue, PaperError, type PaperCosts } from './paper-trading-math'
import type { VerifiedClose } from './paper-trading-prices'
import type { Allocation } from './sample-portfolios'

const decimalDollars = (cents: bigint) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`

export function sizePaperBasket(allocations: Allocation[], closes: VerifiedClose[], budgetCents: bigint, cashCents: bigint, costs: PaperCosts) {
  if (budgetCents > cashCents) throw new PaperError('The basket budget exceeds current buying power.', 409)
  if (closes.length !== allocations.length || new Set(closes.map(close => close.symbol)).size !== closes.length) throw new PaperError('Every instrument needs a distinct verified USD closing price.')
  const legs = allocations.map(({ weightBps }, index) => {
    const close = closes[index]
    const budget = budgetCents * BigInt(weightBps) / 10_000n
    if (budget < 1n) throw new PaperError('Increase the budget: at least one allocation is less than one cent.')
    const amount = decimalDollars(budget)
    const estimate = estimateOrder('buy', 'dollars', amount, close.priceMicros, costs)
    return { close, amount, estimate }
  })
  const total = legs.reduce((sum, leg) => sum - leg.estimate.deltaCents, 0n)
  if (total > budgetCents || total > cashCents) throw new PaperError('This basket exceeds current buying power, including trading costs.', 409)
  const commission = legs.reduce((sum, leg) => sum + leg.estimate.commissionCents, 0n)
  const slippage = legs.reduce((sum, { estimate, close }) => sum + estimate.notionalCents - marketValue(estimate.units, close.priceMicros), 0n)
  return { legs, total, commission, slippage, remaining: cashCents - total }
}
