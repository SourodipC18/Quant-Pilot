import assert from 'node:assert/strict'

const base = 'http://localhost:3000'
const root = '/api/paper-trading'
async function openGuest() {
  const response = await fetch(base + '/api/workspace')
  assert.equal(response.status, 200, await response.text())
  return response.headers.get('set-cookie')?.split(';')[0]
}
const [first, second] = await Promise.all([openGuest(), openGuest()])
assert(first && second && first !== second)

async function req(cookie, action = '', body, status = 200) {
  const response = await fetch(base + root + action, {
    signal: AbortSignal.timeout(18_000),
    headers: { ...(cookie && { cookie }), ...(body && { 'content-type': 'application/json' }) },
    ...(body && { method: 'POST', body: JSON.stringify(body) }),
  })
  const data = (response.headers.get('content-type') ?? '').includes('application/json') ? await response.json() : await response.text()
  assert.equal(response.status, status, JSON.stringify(data))
  return data
}

const cent = value => Math.round(value * 100)
const start = await req(first)
const other = await req(second)
assert.equal(start.cash, 5_000_000)
assert.equal(start.equity, 5_000_000)
assert.equal(start.positions.length, 0)
assert.equal(start.history.length, 1)
assert.equal(start.history[0].equity, start.cash)
assert.notEqual(start.accountId, other.accountId)
await req(null, '', undefined, 409)
const review = (body, status = 200) => req(first, '', { action: 'review', accountId: start.accountId, symbol: 'AAPL', side: 'buy', mode: 'shares', amount: '2', ...body }, status)
await review({ amount: '-2' }, 422)
await review({ symbol: 'RELIANCE:NSE' }, 422)
const orderId = crypto.randomUUID()
const terms = {kind:'limit', side:'buy', amount:'1', limit:1, tif:'GTC'}
const place = {action:'place', accountId:start.accountId, id:orderId, symbol:'AAPL', terms}
const pending = await req(first, '', place)
assert.equal(pending.status, 'pending', JSON.stringify(pending.history))
assert.equal((await req(first, '', place)).id, pending.id)
assert.equal((await req(first)).reserved, 1)
assert.equal((await req(second)).orders.length, 0)
await req(second, '', {action:'cancel',accountId:start.accountId,id:orderId},409)
await req(first, '', {...place,action:'modify',version:pending.history.length,terms:{...terms,amount:'2'}})
assert.equal((await req(first)).reserved, 2)
await req(first, '', {action:'cancel',accountId:start.accountId,id:orderId})
assert.equal((await req(first)).reserved, 0)
const quote = await req(first, '?action=quote&symbol=AAPL')
const clock = new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date())
if (quote.freshness === 'End-of-day' || Date.now()-Date.parse(quote.date) >= 300000 || clock < '09:30' || clock >= '16:00') {
  const rejected = await req(first, '', {...place,id:crypto.randomUUID(),terms:{kind:'market',side:'buy',amount:'1',tif:'GTC'}})
  assert.equal(rejected.status,'rejected')
  assert.equal((await req(first)).completedTrades,0)
  console.log('Verified stored orders, reservations, cancellation, workspace isolation and rejection without a fresh session bar. Fresh-bar settlement checks skipped.')
  process.exit(0)
}
await review({ amount: '10000000' }, 409)
await review({ side: 'sell' }, 409)
const buy = await review({})
assert.equal(buy.quote.freshness, '5-minute bar')
assert.equal(buy.quote.currency, 'USD')
await req(second, '', { action: 'confirm', ticket: buy.ticket }, 403)
await req(second, '', { action: 'reset', confirmation: 'RESET', accountId: start.accountId }, 409)
const submit = (ticket, status = 200) => req(first, '', { action: 'confirm', ticket }, status)
const [filled, duplicate] = await Promise.all([submit(buy.ticket), submit(buy.ticket)])
assert.deepEqual(duplicate, filled)
const afterBuy = await req(first)
assert.equal(cent(afterBuy.cash), cent(start.cash) - cent(buy.notional))
assert.equal(afterBuy.completedTrades, 1)
assert.equal(afterBuy.positions[0].shares, 2)
assert.equal(afterBuy.history.length, 2)
assert.equal((await req(second)).completedTrades, 0)
assert.equal((await req(second, '?action=portfolio')).positions.length, 0)
assert.equal((await req(first, '?action=portfolio')).positions.length, 1)
await review({ side: 'sell', amount: '2.000001' }, 409)
await req(first, '', { action: 'costs', accountId: start.accountId, commissionBps: 100, slippageBps: 100 })
const sale = await review({ side: 'sell', amount: '2' })
assert(sale.commission > 0)
const sold = await submit(sale.ticket)
const afterSale = await req(first)
assert.equal(cent(afterSale.cash), cent(afterBuy.cash) + cent(sale.cashChange))
assert.equal(cent(sold.realized), cent(sale.cashChange) - cent(buy.notional))
assert.equal(afterSale.realized, sold.realized)
assert.equal(afterSale.positions.length, 0)
assert.equal(afterSale.history.length, 3)
assert.equal(afterSale.completedTrades, 2)
const csv = await req(first, '?action=csv')
assert.equal(csv.split('\r\n').length, 3)
assert(csv.includes('5-minute bar,paper'))
assert(!(await req(second, '?action=csv')).includes(sold.id))
await req(first, '', { action: 'reset', confirmation: 'wrong', accountId: start.accountId }, 400)
await req(first, '', { action: 'reset', confirmation: 'RESET', accountId: start.accountId })
await submit(sale.ticket, 409)
const reset = await req(first)
assert.equal(reset.cash, 5_000_000)
assert.equal(reset.positions.length, 0)
assert.equal(reset.completedTrades, 0)
assert.equal(reset.history.length, 1)
assert.equal(reset.realized, 0)
assert.deepEqual(reset.costs, { commissionBps: 0, slippageBps: 0 })
assert.equal((await req(second)).accountId, other.accountId)
console.log('Verified real Neon transactions: exact opening balance, cash debit/credit, sale P&L, snapshots, concurrent replay, invalid orders, CSV, reset, and workspace isolation.')
