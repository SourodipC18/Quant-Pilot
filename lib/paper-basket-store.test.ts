import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { getTableName, type Table, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { STARTING_CASH } from './paper-trading-math'
import { cancelOrder, checkOrders, placeOrder, saveLimits, confirmPaperBasket, confirmPaperOrder, loadPaperAccount, loadPaperComparison, reviewPaperBasket, reviewPaperOrder } from './paper-trading-store'
import { SAMPLE_PORTFOLIOS } from './sample-portfolios'

const mocks = vi.hoisted(() => ({ db: { select: vi.fn(), transaction: vi.fn() }, close: vi.fn() }))
vi.mock('./db', () => ({ db: mocks.db }))
vi.mock('./paper-trading-prices', async importOriginal => ({ ...await importOriginal<typeof import('./paper-trading-prices')>(), getPaperClose: mocks.close }))

const owner = 'guest:test-basket'
const accountId = '12345678-1234-4123-a123-012345678901'
const sample = SAMPLE_PORTFOLIOS[0]
const markDate = '2025-11-04T15:00:00.000Z'
const dialect = new PgDialect()
type Row = Record<string, unknown>
type Tables = Record<string, Row[]>
let initial: Tables
let saved: Tables
let rejectLedger: boolean
let ledgerAttempt: number

function database(tables: Tables) {
  const values = (table: Table) => tables[getTableName(table)]
  function matching(table: Table, filter: SQL) {
    const { params, sql } = dialect.sqlToQuery(filter)
    const aliases: Record<string, string> = { user_id: 'userId', account_id: 'accountId', id: 'id', symbol: 'symbol' }
    const columns = [...sql.matchAll(/"paper_[a-z_]+"\."(user_id|account_id|id|symbol)" = \$(\d+)/g)]
    expect(columns).toHaveLength(params.length)
    return values(table).filter(row => columns.every(([, column, index]) => row[aliases[column]] === params[Number(index) - 1]))
  }
  return {
    select: (fields?: { value: unknown }) => ({ from: (table: Table) => ({ where: (filter: SQL) => {
      const rows = matching(table, filter)
      const result = fields ? [{ value: rows.length }] : rows
      const query = Object.assign(Promise.resolve(result), { for: async () => result, limit: async (limit: number) => result.slice(0, limit) })
      return Object.assign(query, { orderBy: () => query })
    } }) }),
    insert: (table: Table) => ({ values: (value: Row) => {
      const name = getTableName(table)
      if (name === 'paper_accounts') return { onConflictDoNothing: () => ({ returning: async () => [] }) }
      if (name === 'paper_cash_ledger' && ++ledgerAttempt === 2 && rejectLedger) throw new Error('Test failure on the second ledger write')
      const row = { ...value, createdAt: new Date(markDate) }
      values(table).push(row)
      return { returning: async () => [row] }
    } }),
    update: (table: Table) => ({ set: (update: Row) => ({ where: (filter: SQL) => {
      const result = matching(table, filter)
      result.forEach(row => Object.assign(row, update))
      return { returning: async () => result }
    } }) }),
  }
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(markDate))
  vi.stubEnv('BETTER_AUTH_SECRET', 'phase-6b-transaction-test-signing-secret')
  initial = {
    paper_accounts: [{ id: accountId, userId: owner, cashCents: STARTING_CASH, realizedCents: 0n, commissionBps: 12, slippageBps: 20 }],
    paper_positions: [{ userId: owner, accountId, symbol: sample.holdings[0].symbol, units: 1_000_000n, basisCents: 10_000n, markDate, markMicros: 100_000_000n }],
    paper_orders: [], paper_executions: [], paper_cash_ledger: [], paper_equity_snapshots: [],
  }
  saved = structuredClone(initial)
  rejectLedger = false
  ledgerAttempt = 0
  mocks.close.mockImplementation(async (symbol: string) => ({ symbol, date: markDate, priceMicros: 100_000_000n }))
  mocks.db.select.mockImplementation(() => database(saved).select())
  mocks.db.transaction.mockImplementation(async callback => {
    const transaction = structuredClone(saved)
    const result = await callback(database(transaction))
    saved = transaction
    return result
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('trading account valuation', () => {
  it('marks a buy to market on account load, records gains and losses, and preserves the last verified price on failure', async () => {
    const symbol = sample.holdings[0].symbol
    saved.paper_positions = []
    Object.assign(saved.paper_accounts[0], { commissionBps: 0, slippageBps: 0 })
    const review = await reviewPaperOrder(owner, { accountId, symbol, side: 'buy', mode: 'shares', amount: '2' })
    await confirmPaperOrder(owner, review.ticket)
    expect(await loadPaperAccount(owner)).toMatchObject({ cash: 4_999_800, unrealized: 0, realized: 0 })
    expect(saved.paper_equity_snapshots).toHaveLength(1)

    mocks.close.mockResolvedValueOnce({ symbol, date: '2025-11-05T15:00:00.000Z', priceMicros: 110_000_000n })
    expect(await loadPaperAccount(owner)).toMatchObject({ equity: 5_000_020, unrealized: 20, realized: 0, positions: [{ unrealized: 20, mark: 110, averageCost: 100 }] })

    mocks.close.mockResolvedValueOnce({ symbol, date: '2025-11-05', priceMicros: 95_000_000n })
    expect(await loadPaperAccount(owner)).toMatchObject({ equity: 4_999_990, unrealized: -10, positions: [{ unrealized: -10, mark: 95 }] })
    expect(saved.paper_equity_snapshots.map(row => row.unrealizedCents)).toEqual([0n, 2_000n, -1_000n])

    mocks.close.mockResolvedValueOnce({ symbol, date: '2025-11-05T15:05:00.000Z', priceMicros: 105_000_000n })
    expect(await loadPaperAccount(owner)).toMatchObject({ unrealized: -10, unavailableMarks: 1 })
    mocks.close.mockRejectedValueOnce(new Error('Market data unavailable'))
    expect(await loadPaperAccount(owner)).toMatchObject({ unrealized: -10, unavailableMarks: 1 })
    expect(saved.paper_equity_snapshots).toHaveLength(3)
  })
})

describe('advanced paper orders', () => {
  const symbol = sample.holdings[0].symbol
  const terms = { kind: 'limit', side: 'buy', limit: 99, amount: '1', tif: 'GTC' } as const
  function bar(minutes: number, price: number) {
    const date = new Date(Date.parse(markDate) + minutes * 60_000)
    vi.setSystemTime(date)
    mocks.close.mockResolvedValue({symbol, date: date.toISOString(), priceMicros: BigInt(price * 1_000_000)})
  }
  it('persists reservations, rejects stale edits and releases cancelled or expired orders', async () => {
    const id = crypto.randomUUID()
    const order = await placeOrder(owner, accountId, id, symbol, terms)
    expect(await placeOrder(owner, accountId, id, symbol, terms)).toEqual(order)
    const modified = await placeOrder(owner, accountId, id, symbol, {...terms, amount:'2'}, true, 1)
    expect(modified.history).toHaveLength(2)
    await expect(placeOrder(owner, accountId, id, symbol, terms, true, 1)).rejects.toThrow('changed')
    expect((await loadPaperAccount(owner)).reserved).toBe(Number(modified.reserve)/100)
    await cancelOrder(owner,accountId,id)
    const day = await placeOrder(owner,accountId,crypto.randomUUID(),symbol,{...terms,tif:'Day'})
    vi.setSystemTime(new Date(day.expiry!))
    expect(await loadPaperAccount(owner)).toMatchObject({reserved:0, orders:expect.arrayContaining([expect.objectContaining({status:'expired'}),expect.objectContaining({status:'cancelled'})])})
  })
  it.each([[80,'stop-loss'],[120,'take-profit']] as const)('settles a gap at %i and cancels the sibling', async (price, exitKind) => {
    const entry = await placeOrder(owner, accountId, crypto.randomUUID(), symbol, {...terms,kind:'bracket',stop:90,target:110})
    expect(entry.status).toBe('filled')
    const excess = await placeOrder(owner, accountId, crypto.randomUUID(), symbol,{...terms,side:'sell',amount:'2'})
    expect(excess.status).toBe('rejected')
    bar(5,price)
    expect((await checkOrders(owner,accountId)).fills).toBe(1)
    expect((await checkOrders(owner,accountId)).fills).toBe(0)
    const a = await loadPaperAccount(owner)
    expect(a.orders.filter(o=>o.group===entry.id).map(o=>[o.kind,o.status])).toContainEqual([exitKind,'filled'])
    expect(a.orders.filter(o=>o.group===entry.id&&o.status==='cancelled')).toHaveLength(1)
    expect(a.positions[0].shares).toBe(1)
    expect(a.completedTrades).toBe(2)
  })
  it('requires a later qualifying bar after a stop-limit trigger', async () => {
    await placeOrder(owner,accountId,crypto.randomUUID(),symbol,{...terms,kind:'stop-limit',stop:105,limit:108})
    bar(5,106); expect((await checkOrders(owner,accountId)).fills).toBe(0)
    expect((await checkOrders(owner,accountId)).fills).toBe(0)
    bar(10,110); expect((await checkOrders(owner,accountId)).fills).toBe(0)
    bar(15,107); expect((await checkOrders(owner,accountId)).fills).toBe(1)
  })
  it('rejects insufficient cash and enforces risk limits at execution', async () => {
    expect((await placeOrder(owner,accountId,crypto.randomUUID(),symbol,{...terms,amount:'100000'})).status).toBe('rejected')
    await placeOrder(owner,accountId,crypto.randomUUID(),symbol,{...terms,kind:'stop',stop:105})
    await saveLimits(owner,accountId,{order:104}); bar(5,106)
    expect((await checkOrders(owner,accountId)).fills).toBe(0)
    expect(saved.paper_executions).toHaveLength(0)
  })
})

describe('paper basket transaction', () => {
  it('compares and reviews without writing, adds to an existing position, and replays a confirmed ticket without duplicate fills', async () => {
    expect(await loadPaperComparison('guest:unused')).toBeNull()
    const review = await reviewPaperBasket(owner, accountId, '1000', sample.holdings)
    expect(saved).toEqual(initial)
    expect(() => confirmPaperBasket('guest:other', review.ticket)).toThrow('workspace')
    const first = await confirmPaperBasket(owner, review.ticket)
    expect(first.fills).toHaveLength(4)
    expect(saved.paper_cash_ledger).toHaveLength(4)
    expect(saved.paper_equity_snapshots).toHaveLength(1)
    expect(saved.paper_positions[0].units).toBeGreaterThan(1_000_000n)
    expect((await loadPaperComparison(owner))?.cash).toBe(review.remainingCash)
    expect(await confirmPaperBasket(owner, review.ticket)).toEqual(first)
    expect(saved.paper_executions).toHaveLength(4)
  })

  it('aborts the entire transaction if a later leg fails', async () => {
    const review = await reviewPaperBasket(owner, accountId, '1000', sample.holdings)
    rejectLedger = true
    await expect(confirmPaperBasket(owner, review.ticket)).rejects.toThrow('second ledger write')
    expect(saved).toEqual(initial)
  })

  it('rejects a stale cash review and INR before any order writes', async () => {
    const review = await reviewPaperBasket(owner, accountId, '1000', sample.holdings)
    saved.paper_accounts[0].cashCents = STARTING_CASH - 1n
    await expect(confirmPaperBasket(owner, review.ticket)).rejects.toThrow('available cash changed')
    await expect(reviewPaperBasket(owner, accountId, '1000', SAMPLE_PORTFOLIOS[4].holdings)).rejects.toThrow('portfolio’s market')
    expect(saved.paper_executions).toHaveLength(0)
  })
})
