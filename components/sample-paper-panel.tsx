'use client'

import { useRef, useState, type FormEvent } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Field, FieldLabel } from '@/components/ui/field'
import { PaperDialog, paperEndpoint, paperPortfolioEndpoint, paperRequest, quantity, usd } from '@/components/paper-order-ticket'
import { tradingPriceTime, type PaperBasketResult, type PaperBasketReview, type PaperComparison } from '@/lib/paper-trading-types'
import { symbolParts } from '@/lib/market-instruments'
import type { SamplePortfolio } from '@/lib/sample-portfolios'

const comparisonEndpoint = `${paperEndpoint}?action=comparison`

export function SamplePaperPanel({ sample, workspaceReady, valid, onPaper }: { sample: SamplePortfolio; workspaceReady: boolean; valid: boolean; onPaper: () => void }) {
  const [compare, setCompare] = useState(false)
  const [budget, setBudget] = useState('100000')
  const [review, setReview] = useState<PaperBasketReview | null>(null)
  const [error, setError] = useState('')
  const [confirmationError, setConfirmationError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const { mutate: invalidate } = useSWRConfig()
  const { data, isLoading, error: accountError, mutate } = useSWR<{ account: PaperComparison | null }>(sample.currency === 'USD' && compare && workspaceReady ? comparisonEndpoint : null, paperRequest, { revalidateOnFocus: false, shouldRetryOnError: false })
  const account = data?.account

  async function reviewBasket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account || !valid || inFlight.current) return
    inFlight.current = true; setBusy(true); setNotice(''); setError(''); setConfirmationError('')
    try {
      setReview(await paperRequest<PaperBasketReview>(paperEndpoint, { action: 'basket.review', accountId: account.accountId, currency: sample.currency, budget, allocations: sample.holdings.map(({ symbol, weightBps }) => ({ symbol, weightBps })) }))
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Basket review failed.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function confirm() {
    if (!review || inFlight.current) return
    inFlight.current = true; setBusy(true); setConfirmationError('')
    try {
      const result = await paperRequest<PaperBasketResult>(paperEndpoint, { action: 'basket.confirm', ticket: review.ticket })
      setReview(null); setNotice(`${result.fills.length} simulated purchases filled. Existing positions were not reset.`)
      void mutate()
      void invalidate(paperEndpoint)
      void invalidate(paperPortfolioEndpoint)
    } catch (problem) { setConfirmationError(problem instanceof Error ? problem.message : 'The basket could not be confirmed. Retry this review to check the outcome.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  return <section className="panel app-panel">
    <header className="app-panel-header"><div><span className="eyebrow">04 / USD simulator</span><h2>Compare with your account</h2></div><span className="paper-tag">Simulation only</span></header>
    {sample.currency === 'INR' ? <p className="method-note">INR portfolios are research-only. Your USD account has no verified currency conversion, so INR orders and cross-currency position comparisons are unavailable.</p> : <>
      <p className="method-note">Compare target weights with your account’s last verified marks. Purchases are added to existing positions only after you review and confirm the full basket.</p>
      {!compare && <button type="button" className="button small" disabled={!workspaceReady} onClick={() => setCompare(true)}>Open account comparison</button>}
      {isLoading && <p className="method-note" role="status">Reading your account…</p>}
      {accountError && <div className="paper-inline"><p role="alert" className="method-note negative">{accountError.message}</p><button type="button" className="button small" onClick={() => void mutate()}>Retry</button></div>}
      {compare && data && !account && <div className="empty-block"><strong>No account yet</strong><p>Open Trading to start the USD 5,000,000 simulator. Looking at a sample does not initialize an account.</p><button type="button" className="button small" onClick={onPaper}>Open Trading</button></div>}
      {account && <>
        <div className="paper-inline"><span className="paper-tag">Account equity {usd(account.equity)}</span><span className="paper-tag">Idle cash {usd(account.cash)}</span></div>
        <div className="table-scroll"><table className="data-table"><caption className="sr-only">Sample target weight versus account invested weight, excluding cash</caption><thead><tr><th scope="col">Instrument</th><th scope="col">Sample target</th><th scope="col">Account invested weight</th><th scope="col">Account mark date</th></tr></thead><tbody>{[...new Set([...sample.holdings.map(holding => holding.symbol), ...account.positions.map(position => position.symbol)])].map(symbol => {
          const paper = account.positions.find(position => position.symbol === symbol)
          const weight = sample.holdings.find(holding => holding.symbol === symbol)?.weightBps ?? 0
          return <tr key={symbol}><th scope="row">{symbol}</th><td>{(weight / 100).toFixed(2)}%</td><td>{account.investedValue ? `${((paper?.marketValue ?? 0) / account.investedValue * 100).toFixed(2)}%` : '—'}</td><td>{paper ? tradingPriceTime(paper.markDate) : '—'}</td></tr>
        })}</tbody></table></div>
        <form className="sample-inline-form" onSubmit={reviewBasket}><Field className="analytics-field"><FieldLabel htmlFor="sample-paper-budget">Basket budget (USD)</FieldLabel><input id="sample-paper-budget" type="number" min="0.01" max={account.cash} step="0.01" value={budget} onChange={event => setBudget(event.target.value)} required /></Field><button type="submit" className="button" disabled={!valid || busy || account.cash <= 0}>{busy && !review ? 'Verifying prices…' : 'Review simulated purchases'}</button></form>
      </>}
      {error && <p className="method-note negative" role="alert">{error}</p>}{notice && <p className="method-note positive" role="status">{notice}</p>}
    </>}
    {review && <PaperDialog id="sample-basket-review" busy={busy} onClose={() => setReview(null)}>
      <h2 id="sample-basket-review">Confirm simulated basket</h2><p>All orders will fill together or none will. Prices are verified by Twelve Data. The review expires after 90 seconds.</p>
      <div className="table-scroll"><table className="data-table"><caption className="sr-only">Basket order estimates</caption><thead><tr><th scope="col">Ticker</th><th scope="col">Shares</th><th scope="col">Fill price</th><th scope="col">Price as of</th></tr></thead><tbody>{review.orders.map(order => <tr key={order.quote.symbol}><th scope="row">{symbolParts(order.quote.symbol).symbol}</th><td>{quantity(order.shares)}</td><td>{usd(order.fillPrice, 6)}</td><td>{tradingPriceTime(order.quote.date)}</td></tr>)}</tbody></table></div>
      <dl><div><dt>Estimated commission</dt><dd>{usd(review.commission)}</dd></div><div><dt>Estimated slippage</dt><dd>{usd(review.slippage)}</dd></div><div><dt>Total cash debit</dt><dd>{usd(review.totalDebit)}</dd></div><div><dt>Remaining cash</dt><dd>{usd(review.remainingCash)}</dd></div></dl>
      {confirmationError && <p className="negative" role="alert">{confirmationError}</p>}
      <footer><button type="button" className="button" disabled={busy} onClick={() => setReview(null)}>Cancel</button><button type="button" className="button primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'Confirming…' : 'Confirm purchases'}</button></footer>
    </PaperDialog>}
  </section>
}
