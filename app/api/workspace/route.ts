import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { backtestRuns, experiments, portfolioHoldings, portfolios, savedStrategies, watchlistItems } from '@/lib/db/schema'

export const runtime = 'nodejs'
const symbolSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._:/-]+$/)
const jsonSchema = z.record(z.string(), z.unknown())
const inputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('watchlist.add'), symbol: symbolSchema, companyName: z.string().trim().min(1).max(160) }),
  z.object({ type: z.literal('portfolio.create'), name: z.string().trim().min(1).max(80), benchmark: symbolSchema.optional() }),
  z.object({ type: z.literal('holding.save'), portfolioId: z.string().uuid(), symbol: symbolSchema, shares: z.number().finite().positive().max(1e12), averageCost: z.number().finite().positive().max(1e12).nullable().optional() }),
  z.object({ type: z.literal('strategy.save'), name: z.string().trim().min(1).max(80), description: z.string().trim().max(300).default(''), config: jsonSchema }),
  z.object({ type: z.literal('backtest.save'), name: z.string().trim().min(1).max(80), symbol: symbolSchema, benchmark: symbolSchema.nullable().optional(), config: jsonSchema, metrics: jsonSchema, equity: z.array(jsonSchema).max(5000), trades: z.array(jsonSchema).max(5000) }),
  z.object({ type: z.literal('experiment.save'), name: z.string().trim().min(1).max(80), symbol: symbolSchema, benchmark: symbolSchema.nullable().optional(), config: jsonSchema, results: z.array(jsonSchema).max(100) }),
])
const deleteSchema = z.object({ type: z.enum(['watchlist', 'portfolio', 'holding', 'strategy', 'backtest', 'experiment']), id: z.string().uuid() })

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Sign in to access your workspace.' }, { status: 401 })
  try {
    const [watchlist, userPortfolios, holdings, strategies, backtests, savedExperiments] = await Promise.all([
      db.select().from(watchlistItems).where(eq(watchlistItems.userId, userId)).orderBy(desc(watchlistItems.createdAt)).limit(100),
      db.select().from(portfolios).where(eq(portfolios.userId, userId)).orderBy(desc(portfolios.updatedAt)).limit(50),
      db.select().from(portfolioHoldings).where(eq(portfolioHoldings.userId, userId)).limit(500),
      db.select().from(savedStrategies).where(eq(savedStrategies.userId, userId)).orderBy(desc(savedStrategies.updatedAt)).limit(100),
      db.select().from(backtestRuns).where(eq(backtestRuns.userId, userId)).orderBy(desc(backtestRuns.createdAt)).limit(100),
      db.select().from(experiments).where(eq(experiments.userId, userId)).orderBy(desc(experiments.updatedAt)).limit(100),
    ])
    return NextResponse.json({ watchlist, portfolios: userPortfolios, holdings, strategies, backtests, experiments: savedExperiments })
  } catch {
    return NextResponse.json({ error: 'Unable to load the saved workspace.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Sign in to save workspace data.' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Check the submitted fields and try again.' }, { status: 400 })
  const data = parsed.data
  try {
    if (data.type === 'watchlist.add') {
      await db.insert(watchlistItems).values({ id: crypto.randomUUID(), userId, symbol: data.symbol.toUpperCase(), companyName: data.companyName }).onConflictDoNothing()
    } else if (data.type === 'portfolio.create') {
      const [portfolio] = await db.insert(portfolios).values({ id: crypto.randomUUID(), userId, name: data.name, benchmark: data.benchmark?.toUpperCase() ?? 'SPY' }).returning()
      return NextResponse.json({ portfolio }, { status: 201 })
    } else if (data.type === 'holding.save') {
      const [ownedPortfolio] = await db.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, data.portfolioId), eq(portfolios.userId, userId))).limit(1)
      if (!ownedPortfolio) return NextResponse.json({ error: 'Portfolio not found.' }, { status: 404 })
      await db.insert(portfolioHoldings).values({ id: crypto.randomUUID(), userId, portfolioId: data.portfolioId, symbol: data.symbol.toUpperCase(), shares: String(data.shares), averageCost: data.averageCost ? String(data.averageCost) : null }).onConflictDoUpdate({ target: [portfolioHoldings.userId, portfolioHoldings.portfolioId, portfolioHoldings.symbol], set: { shares: String(data.shares), averageCost: data.averageCost ? String(data.averageCost) : null } })
    } else if (data.type === 'strategy.save') {
      await db.insert(savedStrategies).values({ id: crypto.randomUUID(), userId, name: data.name, description: data.description, config: data.config })
    } else if (data.type === 'backtest.save') {
      await db.insert(backtestRuns).values({ id: crypto.randomUUID(), userId, name: data.name, symbol: data.symbol.toUpperCase(), benchmark: data.benchmark?.toUpperCase() ?? null, config: data.config, metrics: data.metrics, equity: data.equity, trades: data.trades })
    } else if (data.type === 'experiment.save') {
      await db.insert(experiments).values({ id: crypto.randomUUID(), userId, name: data.name, symbol: data.symbol.toUpperCase(), benchmark: data.benchmark?.toUpperCase() ?? null, config: data.config, results: data.results })
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Unable to save this item right now.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Sign in to edit your workspace.' }, { status: 401 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid delete request.' }, { status: 400 })
  const { type, id } = parsed.data
  try {
    if (type === 'portfolio') await db.transaction(async tx => {
      await tx.delete(portfolioHoldings).where(and(eq(portfolioHoldings.portfolioId, id), eq(portfolioHoldings.userId, userId)))
      await tx.delete(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)))
    })
    else if (type === 'watchlist') await db.delete(watchlistItems).where(and(eq(watchlistItems.id, id), eq(watchlistItems.userId, userId)))
    else if (type === 'holding') await db.delete(portfolioHoldings).where(and(eq(portfolioHoldings.id, id), eq(portfolioHoldings.userId, userId)))
    else if (type === 'strategy') await db.delete(savedStrategies).where(and(eq(savedStrategies.id, id), eq(savedStrategies.userId, userId)))
    else if (type === 'backtest') await db.delete(backtestRuns).where(and(eq(backtestRuns.id, id), eq(backtestRuns.userId, userId)))
    else await db.delete(experiments).where(and(eq(experiments.id, id), eq(experiments.userId, userId)))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unable to remove this item right now.' }, { status: 500 })
  }
}
