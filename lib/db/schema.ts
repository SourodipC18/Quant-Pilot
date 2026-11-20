import { bigint, bigserial, boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

const date = (name: string) => timestamp(name, { mode: 'date' })

export const user = pgTable('user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false), image: text('image'),
  createdAt: date('createdAt').notNull().defaultNow(), updatedAt: date('updatedAt').notNull().defaultNow(),
})
export const session = pgTable('session', {
  id: text('id').primaryKey(), expiresAt: date('expiresAt').notNull(), token: text('token').notNull().unique(),
  createdAt: date('createdAt').notNull().defaultNow(), updatedAt: date('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'), userAgent: text('userAgent'), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
})
export const account = pgTable('account', {
  id: text('id').primaryKey(), accountId: text('accountId').notNull(), providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }), accessToken: text('accessToken'),
  refreshToken: text('refreshToken'), idToken: text('idToken'), accessTokenExpiresAt: date('accessTokenExpiresAt'),
  refreshTokenExpiresAt: date('refreshTokenExpiresAt'), scope: text('scope'), password: text('password'),
  createdAt: date('createdAt').notNull().defaultNow(), updatedAt: date('updatedAt').notNull().defaultNow(),
})
export const verification = pgTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: date('expiresAt').notNull(), createdAt: date('createdAt').defaultNow(), updatedAt: date('updatedAt').defaultNow(),
})
export const watchlistItems = pgTable('watchlist_items', {
  id: text('id').primaryKey(), userId: text('userId').notNull(), symbol: text('symbol').notNull(),
  companyName: text('companyName').notNull(), createdAt: date('createdAt').notNull().defaultNow(),
}, table => [uniqueIndex('watchlist_items_user_symbol_idx').on(table.userId, table.symbol)])
export const portfolios = pgTable('portfolios', {
  id: text('id').primaryKey(), userId: text('userId').notNull(), name: text('name').notNull(), benchmark: text('benchmark').notNull().default('SPY'),
  createdAt: date('createdAt').notNull().defaultNow(), updatedAt: date('updatedAt').notNull().defaultNow(),
})
export const portfolioHoldings = pgTable('portfolio_holdings', {
  id: text('id').primaryKey(), userId: text('userId').notNull(), portfolioId: text('portfolioId').notNull(), symbol: text('symbol').notNull(),
  shares: numeric('shares', { precision: 24, scale: 8 }).notNull(), averageCost: numeric('averageCost', { precision: 24, scale: 8 }), createdAt: date('createdAt').notNull().defaultNow(),
}, table => [uniqueIndex('portfolio_holdings_user_portfolio_symbol_idx').on(table.userId, table.portfolioId, table.symbol)])
export const savedStrategies = pgTable('saved_strategies', {
  id: text('id').primaryKey(), userId: text('userId').notNull(), name: text('name').notNull(), description: text('description').notNull().default(''),
  config: jsonb('config').notNull(), createdAt: date('createdAt').notNull().defaultNow(), updatedAt: date('updatedAt').notNull().defaultNow(),
})
export const backtestRuns = pgTable('backtest_runs', {
  id: text('id').primaryKey(), userId: text('userId').notNull(), name: text('name').notNull(), symbol: text('symbol').notNull(), benchmark: text('benchmark'),
  config: jsonb('config').notNull(), metrics: jsonb('metrics').notNull(), equity: jsonb('equity').notNull(), trades: jsonb('trades').notNull(), createdAt: date('createdAt').notNull().defaultNow(),
})
export const experiments = pgTable('experiments', {
  id: text('id').primaryKey(), userId: text('userId').notNull(), name: text('name').notNull(), symbol: text('symbol').notNull(), benchmark: text('benchmark'),
  config: jsonb('config').notNull(), results: jsonb('results').notNull(), createdAt: date('createdAt').notNull().defaultNow(), updatedAt: date('updatedAt').notNull().defaultNow(),
})

const fixed = (name: string) => bigint(name, { mode: 'bigint' })
const eventTime = (name = 'created_at') => timestamp(name, { withTimezone: true }).notNull().defaultNow()
const paperScope = () => ({ userId: text('user_id').notNull(), accountId: uuid('account_id').notNull() })

export const paperAccounts = pgTable('paper_accounts', {
  userId: text('user_id').primaryKey(), id: uuid('id').notNull().unique(),
  cashCents: fixed('cash_cents').notNull().default(500_000_000n), realizedCents: fixed('realized_cents').notNull().default(0n),
  commissionBps: integer('commission_bps').notNull().default(0), slippageBps: integer('slippage_bps').notNull().default(0),
  openedAt: eventTime('opened_at'),
})
export const paperPositions = pgTable('paper_positions', {
  ...paperScope(), symbol: text('symbol').notNull(), units: fixed('units').notNull(), basisCents: fixed('basis_cents').notNull(),
  markMicros: fixed('mark_micros').notNull(), markDate: text('mark_date').notNull(),
}, t => [primaryKey({ columns: [t.userId, t.accountId, t.symbol] })])
export const paperExecutions = pgTable('paper_executions', {
  ...paperScope(), id: uuid('id').notNull(), symbol: text('symbol').notNull(), side: text('side', { enum: ['buy', 'sell'] }).notNull(),
  units: fixed('units').notNull(), referenceMicros: fixed('reference_micros').notNull(), fillMicros: fixed('fill_micros').notNull(),
  notionalCents: fixed('notional_cents').notNull(), commissionCents: fixed('commission_cents').notNull(), slippageBps: integer('slippage_bps').notNull(),
  realizedCents: fixed('realized_cents'), markDate: text('mark_date').notNull(), createdAt: eventTime(),
}, t => [primaryKey({ columns: [t.userId, t.accountId, t.id] }), index('paper_executions_recent_idx').on(t.userId, t.accountId, t.createdAt.desc(), t.id.desc())])
export const paperCashLedger = pgTable('paper_cash_ledger', {
  ...paperScope(), id: uuid('id').notNull(), kind: text('kind', { enum: ['funding', 'fill'] }).notNull(),
  deltaCents: fixed('delta_cents').notNull(), cashCents: fixed('cash_cents').notNull(), createdAt: eventTime(),
}, t => [primaryKey({ columns: [t.userId, t.accountId, t.id] })])
export const paperEquitySnapshots = pgTable('paper_equity_snapshots', {
  ...paperScope(), id: bigserial('id', { mode: 'bigint' }).primaryKey(), cashCents: fixed('cash_cents').notNull(),
  marketValueCents: fixed('market_value_cents').notNull(), unrealizedCents: fixed('unrealized_cents').notNull(),
  realizedCents: fixed('realized_cents').notNull(), createdAt: eventTime(),
}, t => [index('paper_equity_recent_idx').on(t.userId, t.accountId, t.id.desc())])
