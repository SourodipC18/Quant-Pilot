import { boolean, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

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
