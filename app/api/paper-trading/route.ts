import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { MarketDataError } from '@/lib/market-data'
import { SYMBOL_PATTERN } from '@/lib/market-instruments'
import { PaperError, parseOrderAmount } from '@/lib/paper-trading-math'
import { getPaperClose, paperQuote } from '@/lib/paper-trading-prices'
import { confirmPaperBasket, confirmPaperOrder, exportPaperTrades, loadPaperAccount, loadPaperComparison, loadPaperPortfolio, refreshPaperMarks, resetPaperAccount, reviewPaperBasket, reviewPaperOrder, updatePaperCosts } from '@/lib/paper-trading-store'
import { guestWorkspaceEnabled, resolveWorkspaceIdentity } from '@/lib/workspace-access'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }
const symbol = z.string().trim().regex(SYMBOL_PATTERN).transform(value => value.toUpperCase())
const accountId = z.uuidv4()
const bps = z.number().int().min(0).max(100)
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('review'), accountId, symbol, side: z.enum(['buy', 'sell']), mode: z.enum(['shares', 'dollars']), amount: z.string().trim().max(18) }),
  z.object({ action: z.literal('confirm'), ticket: z.string().min(1).max(2000) }),
  z.object({ action: z.literal('basket.review'), accountId, budget: z.string().trim().max(18), currency: z.literal('USD'), allocations: z.array(z.object({ symbol, weightBps: z.number().int().min(1).max(10_000) })).min(3).max(8) }),
  z.object({ action: z.literal('basket.confirm'), ticket: z.string().min(1).max(8000) }),
  z.object({ action: z.literal('costs'), accountId, commissionBps: bps, slippageBps: bps }),
  z.object({ action: z.literal('reset'), accountId, confirmation: z.literal('RESET') }),
  z.object({ action: z.literal('refresh'), accountId }),
])

function respond(data: unknown, status = 200) { return NextResponse.json(data, { status, headers }) }
function problem(error: unknown) {
  if (error instanceof PaperError) return respond({ error: error.message }, error.status)
  if (error instanceof MarketDataError) return respond({ error: `${error.message} No simulated fill was made.` }, error.httpStatus)
  console.error('Paper trading request failed', error instanceof Error ? error.name : 'Unknown error')
  return respond({ error: 'Paper trading is temporarily unavailable. Try again shortly.' }, 503)
}

async function userIdFor(request: NextRequest) {
  const identity = await resolveWorkspaceIdentity(request)
  if (!identity) throw new PaperError(guestWorkspaceEnabled ? 'Open your workspace first and allow workspace cookies.' : 'Sign in to use paper trading.', guestWorkspaceEnabled ? 409 : 401)
  return `${identity.kind}:${identity.id}`
}

export async function GET(request: NextRequest) {
  try {
    const userId = await userIdFor(request)
    const action = request.nextUrl.searchParams.get('action') ?? 'account'
    if (action === 'account') return respond(await loadPaperAccount(userId))
    if (action === 'portfolio') return respond(await loadPaperPortfolio(userId))
    if (action === 'comparison') return respond({ account: await loadPaperComparison(userId) })
    if (action === 'quote') {
      const parsed = symbol.safeParse(request.nextUrl.searchParams.get('symbol'))
      if (!parsed.success) return respond({ error: 'Select a valid symbol.' }, 400)
      return respond(paperQuote(await getPaperClose(parsed.data)))
    }
    if (action === 'csv') return new Response(await exportPaperTrades(userId), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="quantpilot-paper-trades.csv"' } })
    return respond({ error: 'Unsupported paper trading action.' }, 400)
  } catch (error) { return problem(error) }
}

export async function POST(request: NextRequest) {
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return respond({ error: 'Cross-origin changes are not allowed.' }, 403)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return respond({ error: 'Expected application/json.' }, 415)
  try {
    const userId = await userIdFor(request)
    const parsed = input.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return respond({ error: 'Check the submitted fields and try again.' }, 400)
    const data = parsed.data
    if (data.action === 'review') {
      parseOrderAmount(data.amount, data.mode)
      const { accountId, symbol, side, mode, amount } = data
      return respond(await reviewPaperOrder(userId, { accountId, symbol, side, mode, amount }))
    }
    if (data.action === 'confirm') return respond(await confirmPaperOrder(userId, data.ticket))
    if (data.action === 'basket.review') return respond(await reviewPaperBasket(userId, data.accountId, data.budget, data.allocations))
    if (data.action === 'basket.confirm') return respond(await confirmPaperBasket(userId, data.ticket))
    if (data.action === 'refresh') return respond(await refreshPaperMarks(userId, data.accountId))
    if (data.action === 'reset') await resetPaperAccount(userId, data.accountId)
    if (data.action === 'costs') await updatePaperCosts(userId, data.accountId, { commissionBps: data.commissionBps, slippageBps: data.slippageBps })
    return respond({ ok: true })
  } catch (error) { return problem(error) }
}
