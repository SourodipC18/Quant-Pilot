import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './db'
import { paperAccounts, paperCashLedger, paperEquitySnapshots, paperExecutions, paperPositions } from './db/schema'
import { applyFill, dollarsNumber, estimateOrder, marketValue, PaperError, priceNumber, sharesNumber, STARTING_CASH, type PaperCosts, type PaperMode, type PaperSide } from './paper-trading-math'
import { getPaperClose, markOrder, paperQuote, type VerifiedClose } from './paper-trading-prices'
import type { PaperAccount, PaperBasketResult, PaperBasketReview, PaperComparison, PaperFill, PaperPortfolio, PaperReview } from './paper-trading-types'
import { allocationError, type Allocation } from './sample-portfolios'
import { parseOrderAmount } from './paper-trading-math'
import { sizePaperBasket } from './paper-basket'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Account = typeof paperAccounts.$inferSelect
type Position = typeof paperPositions.$inferSelect
type Execution = typeof paperExecutions.$inferSelect
type ScopedTable = typeof paperPositions | typeof paperExecutions | typeof paperCashLedger | typeof paperEquitySnapshots
const scope = (table: ScopedTable, account: Account) => and(eq(table.userId, account.userId), eq(table.accountId, account.id))
const accountScope = (account: Account) => and(eq(paperAccounts.userId, account.userId), eq(paperAccounts.id, account.id))
const orderScope = (account: Account, id: string) => and(scope(paperExecutions, account), eq(paperExecutions.id, id))
const reviewSchema = z.object({
  accountId: z.uuidv4(), orderId: z.uuidv4(), side: z.enum(['buy', 'sell']), mode: z.enum(['shares', 'dollars']), amount: z.string(),
  symbol: z.string(), priceMicros: z.string().regex(/^\d+$/), date: z.string(), commissionBps: z.number(), slippageBps: z.number(), expiresAt: z.number(),
})
type Ticket = z.infer<typeof reviewSchema>

function signature(userId: string, payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('Paper review signing secret unavailable')
  return createHmac('sha256', secret).update('paper-trading-review/v1\0').update(userId).update('\0').update(payload).digest()
}

const basketSchema = z.object({
  kind: z.literal('basket'), accountId: z.uuidv4(), cashCents: z.string().regex(/^\d+$/), expiresAt: z.number(),
  commissionBps: z.number(), slippageBps: z.number(), orders: z.array(reviewSchema.extend({ side: z.literal('buy'), mode: z.literal('dollars') })).min(3).max(8),
})

function sealTicket(userId: string, review: unknown) {
  const payload = Buffer.from(JSON.stringify(review)).toString('base64url')
  return `${payload}.${signature(userId, payload).toString('base64url')}`
}

function readTicket<T>(userId: string, ticket: string, schema: z.ZodType<T>): T {
  const [payload, mac, extra] = ticket.split('.')
  if (!payload || !mac || extra !== undefined || !/^[\w-]+$/.test(payload) || !/^[\w-]{43}$/.test(mac)) throw new PaperError('Invalid order review. Review the order again.', 400)
  const supplied = Buffer.from(mac, 'base64url')
  if (supplied.length !== 32 || !timingSafeEqual(signature(userId, payload), supplied)) throw new PaperError('Invalid order review for this workspace.', 403)
  try { return schema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))) }
  catch { throw new PaperError('Invalid order review. Review the order again.', 400) }
}

async function recordFunding(tx: Tx, account: Account) {
  await tx.insert(paperCashLedger).values({ userId: account.userId, accountId: account.id, id: account.id, kind: 'funding', deltaCents: STARTING_CASH, cashCents: STARTING_CASH })
  await recordSnapshot(tx, account, [])
}

async function withAccount<T>(userId: string, action: (tx: Tx, account: Account) => Promise<T>) {
  return db.transaction(async tx => {
    const [newAccount] = await tx.insert(paperAccounts).values({ userId, id: crypto.randomUUID() }).onConflictDoNothing({ target: paperAccounts.userId }).returning()
    const account = newAccount ?? (await tx.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).for('update'))[0]
    if (!account) throw new Error('Workspace account not found after initialization')
    if (newAccount) await recordFunding(tx, newAccount)
    return action(tx, account)
  })
}

function requireGeneration(account: Account, id: string) {
  if (account.id !== id) throw new PaperError('The account has changed. Refresh and try again.', 409)
}

function accountTotals(positions: Position[]) {
  return positions.reduce((total, row) => ({ invested: total.invested + row.basisCents, marketValue: total.marketValue + marketValue(row.units, row.markMicros) }), { invested: 0n, marketValue: 0n })
}

async function recordSnapshot(tx: Tx, account: Account, positions: Position[]) {
  const totals = accountTotals(positions)
  await tx.insert(paperEquitySnapshots).values({ userId: account.userId, accountId: account.id, cashCents: account.cashCents, marketValueCents: totals.marketValue, unrealizedCents: totals.marketValue - totals.invested, realizedCents: account.realizedCents })
}

const listPositions = (tx: Tx, account: Account) => tx.select().from(paperPositions).where(scope(paperPositions, account)).orderBy(asc(paperPositions.symbol))
const listTrades = (tx: Tx, account: Account) => tx.select().from(paperExecutions).where(scope(paperExecutions, account)).orderBy(desc(paperExecutions.createdAt), desc(paperExecutions.id))
const holdings = (positions: Position[]) => positions.map(row => ({ symbol: row.symbol, shares: sharesNumber(row.units), averageCost: dollarsNumber(row.basisCents) / sharesNumber(row.units) }))

function fill(row: Execution): PaperFill {
  return {
    id: row.id, createdAt: row.createdAt.toISOString(), symbol: row.symbol, side: row.side, shares: sharesNumber(row.units),
    fillPrice: priceNumber(row.fillMicros), referencePrice: priceNumber(row.referenceMicros), notional: dollarsNumber(row.notionalCents),
    commission: dollarsNumber(row.commissionCents), realized: row.realizedCents === null ? null : dollarsNumber(row.realizedCents),
    slippageBps: row.slippageBps, markDate: row.markDate,
  }
}

export const loadPaperPortfolio = (userId: string): Promise<PaperPortfolio> => withAccount(userId, async (tx, account) => {
  const positions = await listPositions(tx, account)
  return { accountId: account.id, cash: dollarsNumber(account.cashCents), equity: dollarsNumber(account.cashCents + accountTotals(positions).marketValue), positions: holdings(positions) }
})

export async function loadPaperAccount(userId: string): Promise<PaperAccount> {
  const pricing = await refreshAccountMarks(userId)
  return accountSummary(userId, pricing.unavailable)
}

const accountSummary = (userId: string, unavailableMarks: number): Promise<PaperAccount> => withAccount(userId, async (tx, account) => {
  const positions = await listPositions(tx, account)
  const recent = await listTrades(tx, account).limit(50)
  const [{ value: completedTrades }] = await tx.select({ value: count() }).from(paperExecutions).where(scope(paperExecutions, account))
  const latest = await tx.select().from(paperEquitySnapshots).where(scope(paperEquitySnapshots, account)).orderBy(desc(paperEquitySnapshots.id)).limit(250)
  const [first] = latest.length === 250 ? await tx.select().from(paperEquitySnapshots).where(scope(paperEquitySnapshots, account)).orderBy(asc(paperEquitySnapshots.id)).limit(1) : []
  const rows = latest.reverse()
  if (first && first.id !== rows[0]?.id) rows.unshift(first)
  const totals = accountTotals(positions)
  const equity = account.cashCents + totals.marketValue
  return {
    accountId: account.id, startingCash: dollarsNumber(STARTING_CASH), cash: dollarsNumber(account.cashCents), buyingPower: dollarsNumber(account.cashCents),
    equity: dollarsNumber(equity), invested: dollarsNumber(totals.invested), marketValue: dollarsNumber(totals.marketValue),
    realized: dollarsNumber(account.realizedCents), unrealized: dollarsNumber(totals.marketValue - totals.invested), unavailableMarks,
    totalReturn: Number(equity - STARTING_CASH) / Number(STARTING_CASH), costs: { commissionBps: account.commissionBps, slippageBps: account.slippageBps }, completedTrades,
    positions: holdings(positions).map((row, i) => {
      const position = positions[i], value = marketValue(position.units, position.markMicros)
      return { ...row, mark: priceNumber(position.markMicros), markDate: position.markDate, marketValue: dollarsNumber(value), unrealized: dollarsNumber(value - position.basisCents) }
    }),
    trades: recent.map(fill), history: rows.map(row => ({ date: row.createdAt.toISOString(), equity: dollarsNumber(row.cashCents + row.marketValueCents), realized: dollarsNumber(row.realizedCents), unrealized: dollarsNumber(row.unrealizedCents), pnl: dollarsNumber(row.realizedCents + row.unrealizedCents) })),
  }
})

type OrderInput = { accountId: string; symbol: string; side: PaperSide; mode: PaperMode; amount: string }
const livePosition = async (tx: Tx, account: Account, symbol: string) => (await tx.select().from(paperPositions).where(and(scope(paperPositions, account), eq(paperPositions.symbol, symbol))).limit(1))[0]

export async function reviewPaperOrder(userId: string, order: OrderInput): Promise<PaperReview> {
  const close = await getPaperClose(order.symbol)
  return withAccount(userId, async (tx, account) => {
    requireGeneration(account, order.accountId)
    const est = estimateOrder(order.side, order.mode, order.amount, close.priceMicros, account)
    const position = await livePosition(tx, account, close.symbol)
    if (position && markOrder(position.markDate) > markOrder(close.date)) throw new PaperError('A newer price is required for this position.', 503)
    applyFill(account.cashCents, position, order.side, est)
    const expiresAt = Date.now() + 90_000
    const review: Ticket = {
      ...order, symbol: close.symbol, date: close.date, priceMicros: String(close.priceMicros), expiresAt,
      commissionBps: account.commissionBps, slippageBps: account.slippageBps, orderId: crypto.randomUUID(),
    }
    return {
      ticket: sealTicket(userId, review), expiresAt, side: order.side,
      shares: sharesNumber(est.units), fillPrice: priceNumber(est.fillMicros), notional: dollarsNumber(est.notionalCents),
      commission: dollarsNumber(est.commissionCents), cashChange: dollarsNumber(est.deltaCents), quote: paperQuote(close),
    }
  })
}

function validateReview(account: Account, order: { expiresAt: number } & PaperCosts) {
  if (Date.now() >= order.expiresAt) throw new PaperError('This price review expired. Review the order again.', 409)
  if (account.commissionBps !== order.commissionBps || account.slippageBps !== order.slippageBps) throw new PaperError('Trading costs changed. Review the order again.', 409)
}

async function executeLockedFill(tx: Tx, account: Account, order: Ticket) {
  const userId = account.userId
  const referenceMicros = BigInt(order.priceMicros)
  const est = estimateOrder(order.side, order.mode, order.amount, referenceMicros, account)
  const position = await livePosition(tx, account, order.symbol)
  if (position && markOrder(position.markDate) > markOrder(order.date)) throw new PaperError('A newer price is available. Review the order again.', 409)
  const next = applyFill(account.cashCents, position, order.side, est)
  const owned = { userId, accountId: account.id }
  const positionFilter = and(scope(paperPositions, account), eq(paperPositions.symbol, order.symbol))
  if (next.position.units === 0n) await tx.delete(paperPositions).where(positionFilter)
  else if (position) await tx.update(paperPositions).set({ ...next.position, markDate: order.date, markMicros: referenceMicros }).where(positionFilter)
  else await tx.insert(paperPositions).values({ ...owned, symbol: order.symbol, ...next.position, markDate: order.date, markMicros: referenceMicros })
  const [updated] = await tx.update(paperAccounts).set({ cashCents: next.cashCents, realizedCents: account.realizedCents + (next.realizedCents ?? 0n) }).where(accountScope(account)).returning()
  const { units, fillMicros, notionalCents, commissionCents, deltaCents } = est
  const [execution] = await tx.insert(paperExecutions).values({ ...owned, id: order.orderId, symbol: order.symbol, side: order.side, units, referenceMicros, fillMicros, notionalCents, commissionCents, slippageBps: order.slippageBps, realizedCents: next.realizedCents, markDate: order.date }).returning()
  await tx.insert(paperCashLedger).values({ ...owned, id: order.orderId, kind: 'fill', deltaCents, cashCents: next.cashCents })
  return { account: updated, execution: fill(execution) }
}

export function confirmPaperOrder(userId: string, ticket: string) {
  const order = readTicket(userId, ticket, reviewSchema)
  return withAccount(userId, async (tx, account) => {
    requireGeneration(account, order.accountId)
    const [existing] = await tx.select().from(paperExecutions).where(orderScope(account, order.orderId))
    if (existing) return fill(existing)
    validateReview(account, order)
    const executed = await executeLockedFill(tx, account, order)
    await recordSnapshot(tx, executed.account, await listPositions(tx, executed.account))
    return executed.execution
  })
}

export const loadPaperComparison = (userId: string): Promise<PaperComparison | null> => db.transaction(async tx => {
  const [account] = await tx.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).for('share')
  if (!account) return null
  const positions = await listPositions(tx, account)
  const invested = accountTotals(positions).marketValue
  return { accountId: account.id, cash: dollarsNumber(account.cashCents), equity: dollarsNumber(account.cashCents + invested), investedValue: dollarsNumber(invested), positions: positions.map(position => ({ symbol: position.symbol, marketValue: dollarsNumber(marketValue(position.units, position.markMicros)), markDate: position.markDate })) }
})

export async function reviewPaperBasket(userId: string, accountId: string, budget: string, allocations: Allocation[]): Promise<PaperBasketReview> {
  const invalid = allocationError('USD', allocations)
  if (invalid) throw new PaperError(invalid)
  const budgetCents = parseOrderAmount(budget, 'dollars')
  const [existing] = await db.select().from(paperAccounts).where(eq(paperAccounts.userId, userId))
  if (!existing) throw new PaperError('Open Trading to initialize your account first.', 409)
  requireGeneration(existing, accountId)
  if (budgetCents > existing.cashCents) throw new PaperError('The basket budget exceeds current buying power.', 409)
  const closes = await Promise.all(allocations.map(async ({ symbol }) => {
    try { return await getPaperClose(symbol) }
    catch (error) { throw new PaperError(`${symbol}: ${error instanceof Error ? error.message : 'No verified price is available.'}`, 422) }
  }))
  return db.transaction(async tx => {
    const [account] = await tx.select().from(paperAccounts).where(eq(paperAccounts.userId, userId)).for('share')
    if (!account) throw new PaperError('Open Trading to initialize your account first.', 409)
    requireGeneration(account, accountId)
    const sized = sizePaperBasket(allocations, closes, budgetCents, account.cashCents, account)
    const positions = await listPositions(tx, account)
    if (closes.some(close => positions.some(position => position.symbol === close.symbol && markOrder(position.markDate) > markOrder(close.date)))) throw new PaperError('A newer price is required for one or more holdings.', 409)
    const expiresAt = Date.now() + 90_000
    const { commissionBps, slippageBps } = account
    const signed = { kind: 'basket' as const, accountId, cashCents: String(account.cashCents), expiresAt, commissionBps, slippageBps, orders: sized.legs.map(({ close, amount }) => ({
      side: 'buy' as const, mode: 'dollars' as const, amount, accountId, orderId: crypto.randomUUID(), symbol: close.symbol,
      date: close.date, priceMicros: String(close.priceMicros), expiresAt, commissionBps, slippageBps,
    })) }
    return {
      ticket: sealTicket(userId, signed), expiresAt, budget: dollarsNumber(budgetCents), totalDebit: dollarsNumber(sized.total), commission: dollarsNumber(sized.commission), slippage: dollarsNumber(sized.slippage), remainingCash: dollarsNumber(sized.remaining),
      orders: sized.legs.map(({ close, estimate }) => ({ quote: paperQuote(close), shares: sharesNumber(estimate.units), fillPrice: priceNumber(estimate.fillMicros), notional: dollarsNumber(estimate.notionalCents), commission: dollarsNumber(estimate.commissionCents), cashChange: dollarsNumber(estimate.deltaCents) })),
    }
  })
}

export function confirmPaperBasket(userId: string, ticket: string): Promise<PaperBasketResult> {
  const basket = readTicket(userId, ticket, basketSchema)
  return withAccount(userId, async (tx, account) => {
    requireGeneration(account, basket.accountId)
    const existing: PaperFill[] = []
    for (const order of basket.orders) {
      const [row] = await tx.select().from(paperExecutions).where(orderScope(account, order.orderId))
      if (row) existing.push(fill(row))
    }
    if (existing.length === basket.orders.length) return { fills: existing }
    if (existing.length) throw new PaperError('This basket cannot be repeated. Check your transaction history.', 409)
    validateReview(account, basket)
    if (account.cashCents !== BigInt(basket.cashCents)) throw new PaperError('Your available cash changed. Review the basket again.', 409)
    let current = account
    const fills = []
    for (const order of basket.orders) {
      const executed = await executeLockedFill(tx, current, order)
      current = executed.account
      fills.push(executed.execution)
    }
    await recordSnapshot(tx, current, await listPositions(tx, current))
    return { fills }
  })
}

export const updatePaperCosts = (userId: string, id: string, costs: PaperCosts) => withAccount(userId, async (tx, account) => {
  requireGeneration(account, id)
  await tx.update(paperAccounts).set(costs).where(accountScope(account))
})

export const resetPaperAccount = (userId: string, id: string) => withAccount(userId, async (tx, account) => {
  requireGeneration(account, id)
  await tx.delete(paperPositions).where(scope(paperPositions, account))
  await tx.delete(paperExecutions).where(scope(paperExecutions, account))
  await tx.delete(paperCashLedger).where(scope(paperCashLedger, account))
  await tx.delete(paperEquitySnapshots).where(scope(paperEquitySnapshots, account))
  const [reset] = await tx.update(paperAccounts).set({ id: crypto.randomUUID(), openedAt: new Date(), cashCents: STARTING_CASH, realizedCents: 0n, commissionBps: 0, slippageBps: 0 }).where(accountScope(account)).returning()
  await recordFunding(tx, reset)
})

export const refreshPaperMarks = (userId: string, id: string) => refreshAccountMarks(userId, id)

async function refreshAccountMarks(userId: string, expectedId?: string) {
  const { id, positions } = await withAccount(userId, async (tx, account) => {
    if (expectedId) requireGeneration(account, expectedId)
    return { id: account.id, positions: await listPositions(tx, account) }
  })
  if (!positions.length) return { updated: 0, unavailable: 0 }
  const closes = new Map<string, VerifiedClose>()
  for (let i = 0; i < positions.length; i += 4) {
    const batch = await Promise.allSettled(positions.slice(i, i + 4).map(position => getPaperClose(position.symbol)))
    for (const result of batch) if (result.status === 'fulfilled') closes.set(result.value.symbol, result.value)
  }
  return withAccount(userId, async (tx, account) => {
    if (expectedId) requireGeneration(account, expectedId)
    if (id !== account.id) return { updated: 0, unavailable: 0 }
    const current = await listPositions(tx, account)
    let updated = 0, unavailable = 0
    for (const position of current) {
      const close = closes.get(position.symbol)
      if (!close || markOrder(close.date) < markOrder(position.markDate)) { unavailable++; continue }
      if (position.markDate === close.date && position.markMicros === close.priceMicros) continue
      await tx.update(paperPositions).set({ markDate: close.date, markMicros: close.priceMicros }).where(and(scope(paperPositions, account), eq(paperPositions.symbol, position.symbol)))
      updated++
    }
    if (updated) await recordSnapshot(tx, account, await listPositions(tx, account))
    return { updated, unavailable }
  })
}

export const exportPaperTrades = (userId: string) => withAccount(userId, async (tx, account) => {
  const rows = (await listTrades(tx, account)).map(fill)
  return ['execution_id,executed_at_utc,symbol,side,shares,reference_price_usd,fill_price_usd,notional_usd,commission_usd,slippage_bps,realized_pnl_usd,reference_close_date,price_type,simulation',
    ...rows.map(row => [row.id, row.createdAt, row.symbol, row.side, row.shares, row.referencePrice, row.fillPrice, row.notional.toFixed(2), row.commission.toFixed(2), row.slippageBps, row.realized?.toFixed(2), row.markDate, 'End-of-day', 'paper'].join(',')),
  ].join('\r\n')
})
