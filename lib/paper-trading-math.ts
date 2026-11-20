export const STARTING_CASH = 500_000_000n
const MICRO = 1_000_000n
const BPS = 10_000n
const CENT_SCALE = 10_000_000_000n
export const MAX_ORDER_UNITS = 10_000_000n * MICRO
export const MAX_ORDER_CENTS = 10_000_000_000n
export type PaperSide = 'buy' | 'sell'
export type PaperMode = 'shares' | 'dollars'
export type PaperCosts = { commissionBps: number; slippageBps: number }
export type PaperPositionBalance = { units: bigint; basisCents: bigint }

export class PaperError extends Error {
  constructor(message: string, readonly status = 422) { super(message); this.name = 'PaperError' }
}

export const sharesNumber = (units: bigint) => Number(units) / 1_000_000
export const dollarsNumber = (cents: bigint) => Number(cents) / 100
export const priceNumber = sharesNumber
export const roundDivide = (value: bigint, divisor: bigint) => (value + divisor / 2n) / divisor
export const marketValue = (units: bigint, micros: bigint) => roundDivide(units * micros, CENT_SCALE)

export function parseOrderAmount(value: string, mode: PaperMode) {
  const decimal = mode === 'shares' ? /^(\d{1,8})(?:\.(\d{1,6}))?$/ : /^(\d{1,9})(?:\.(\d{1,2}))?$/
  const match = decimal.exec(value)
  const places = mode === 'shares' ? 6 : 2
  const amount = match ? BigInt(match[1] + (match[2] ?? '').padEnd(places, '0')) : 0n
  if (amount <= 0n || amount > (mode === 'shares' ? MAX_ORDER_UNITS : MAX_ORDER_CENTS)) {
    throw new PaperError(mode === 'shares' ? 'Enter a positive share quantity with up to six decimals (max 10 million shares).' : 'Enter a positive USD amount with up to two decimals (max $100 million).')
  }
  return amount
}

export function estimateOrder(side: PaperSide, mode: PaperMode, value: string, referenceMicros: bigint, costs: PaperCosts) {
  const amount = parseOrderAmount(value, mode)
  const fillMicros = roundDivide(referenceMicros * (BPS + BigInt(costs.slippageBps) * (side === 'buy' ? 1n : -1n)), BPS)
  const priceAmounts = (units: bigint) => {
    const notionalCents = marketValue(units, fillMicros)
    const commissionCents = roundDivide(notionalCents * BigInt(costs.commissionBps), BPS)
    return { notionalCents, commissionCents, deltaCents: side === 'buy' ? -notionalCents - commissionCents : notionalCents - commissionCents }
  }
  let units = amount
  if (mode === 'dollars') {
    const rawUnits = amount * CENT_SCALE / fillMicros
    if (rawUnits > MAX_ORDER_UNITS) throw new PaperError('This amount exceeds the 10 million share limit.')
    if (side === 'sell') units = rawUnits
    else {
      let lower = 0n, upper = rawUnits
      while (lower < upper) {
        const middle = (lower + upper + 1n) / 2n
        if (-priceAmounts(middle).deltaCents > amount) upper = middle - 1n
        else lower = middle
      }
      units = lower
    }
  }
  const amounts = priceAmounts(units)
  if (units <= 0n || amounts.notionalCents <= 0n) throw new PaperError('The order must be worth at least one cent after rounding.')
  return { units, referenceMicros, fillMicros, ...amounts }
}

export function applyFill(cashCents: bigint, position: PaperPositionBalance | undefined, side: PaperSide, order: ReturnType<typeof estimateOrder>) {
  const units = position?.units ?? 0n, basisCents = position?.basisCents ?? 0n
  const nextCash = cashCents + order.deltaCents
  if (side === 'buy') {
    if (nextCash < 0n) throw new PaperError('This order exceeds available cash, including commission.', 409)
    return { cashCents: nextCash, position: { units: units + order.units, basisCents: basisCents - order.deltaCents }, realizedCents: null }
  }
  if (order.units > units) throw new PaperError('You cannot sell more shares than you own. Short selling is not supported.', 409)
  const releasedBasis = roundDivide(basisCents * order.units, units)
  return { cashCents: nextCash, position: { units: units - order.units, basisCents: basisCents - releasedBasis }, realizedCents: order.deltaCents - releasedBasis }
}
