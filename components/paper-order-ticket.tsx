'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, LockKeyhole } from 'lucide-react'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { estimateOrder, dollarsNumber, sharesNumber, type PaperMode, type PaperSide } from '@/lib/paper-trading-math'
import { priceLabel } from '@/lib/market-instruments'
import { tradingPriceTime, type PaperAccount, type PaperFill, type PaperQuote, type PaperReview } from '@/lib/paper-trading-types'

export const paperEndpoint = '/api/paper-trading'
export const paperPortfolioEndpoint = `${paperEndpoint}?action=portfolio`
export const usd = (value?: number | null, digits = 2) => priceLabel(value, 'USD', digits)
export const quantity = (shares: number) => shares.toLocaleString('en-US', { maximumFractionDigits: 6 })

export async function paperRequest<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(body?.action === 'refresh' || !body && url === paperEndpoint ? 55_000 : 20_000), ...(body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.error ?? 'Trading is temporarily unavailable. Try again shortly.')
  return data as T
}

export function PaperDialog({ id, children, busy, onClose }: { id: string; children: ReactNode; busy: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={ref} className="panel paper-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>{children}</dialog>
}

export function PaperOrderTicket({ symbol, account, quote, quoteLoading, onFill }: { symbol: string; account?: PaperAccount; quote?: PaperQuote; quoteLoading: boolean; onFill: (fill: PaperFill) => void }) {
  const [side, setSide] = useState<PaperSide>('buy')
  const [mode, setMode] = useState<PaperMode>('shares')
  const [amount, setAmount] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [review, setReview] = useState<PaperReview | null>(null)
  const [confirmed, setConfirmed] = useState<PaperFill | null>(null)
  const reviewSubmit = useRef<HTMLButtonElement>(null)
  const owned = account?.positions.find(row => row.symbol === quote?.symbol)?.shares ?? 0
  let estimate: ReturnType<typeof estimateOrder> | undefined
  let inputError = ''
  if (quote && account && amount.trim()) {
    try {
      estimate = estimateOrder(side, mode, amount.trim(), BigInt(Math.round(quote.price * 1_000_000)), account.costs)
      if (side === 'sell' && sharesNumber(estimate.units) > owned) inputError = 'You cannot sell more shares than you own.'
      if (side === 'buy' && -dollarsNumber(estimate.deltaCents) > account.buyingPower) inputError = 'This order exceeds available cash.'
    } catch (error) { inputError = error instanceof Error ? error.message : 'Enter a valid amount.' }
  }

  async function prepare() {
    if (!account || !estimate || inputError || busy) return
    setBusy(true); setError(''); setConfirmed(null)
    try { setReview(await paperRequest<PaperReview>(paperEndpoint, { action: 'review', accountId: account.accountId, symbol, side, mode, amount })) }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to review the order.') }
    finally { setBusy(false) }
  }

  function closeReview() {
    setReview(null); setError('')
    requestAnimationFrame(() => reviewSubmit.current?.focus())
  }

  async function confirm() {
    if (!review || busy) return
    setBusy(true); setError('')
    try {
      const fill = await paperRequest<PaperFill>(paperEndpoint, { action: 'confirm', ticket: review.ticket })
      closeReview(); setConfirmed(fill); onFill(fill)
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to confirm the order. Retry this confirmation to check its status.') }
    finally { setBusy(false) }
  }

  return <section className="panel app-panel paper-ticket" aria-labelledby="paper-ticket-title">
    <header className="app-panel-header"><div><span className="eyebrow">02 / Simulated execution</span><h2 id="paper-ticket-title">Order ticket</h2></div><span className="paper-tag">MARKET</span></header>
    <form onSubmit={event => { event.preventDefault(); if (!review) void prepare() }}>
      <div className="paper-sides" role="group" aria-label="Order side">
        <button type="button" aria-pressed={side === 'buy'} onClick={() => { setSide('buy'); setError(''); setConfirmed(null) }}><ArrowUpRight size={15} aria-hidden="true" /> Buy</button>
        <button type="button" aria-pressed={side === 'sell'} onClick={() => { setSide('sell'); setError(''); setConfirmed(null) }}><ArrowDownLeft size={15} aria-hidden="true" /> Sell</button>
      </div>
      <FieldGroup className="paper-entry">
        <Field><FieldLabel htmlFor="paper-order-mode">Size by</FieldLabel><select id="paper-order-mode" value={mode} onChange={event => { setMode(event.target.value as PaperMode); setAmount(''); setError(''); setConfirmed(null) }}><option value="shares">Shares</option><option value="dollars">USD amount</option></select></Field>
        <Field data-invalid={Boolean(inputError)}><FieldLabel htmlFor="paper-order-amount">{mode === 'shares' ? 'Quantity' : 'Amount in USD'}</FieldLabel><input id="paper-order-amount" inputMode="decimal" autoComplete="off" value={amount} maxLength={18} aria-invalid={Boolean(inputError)} aria-describedby={inputError ? 'paper-amount-error' : undefined} onChange={event => { setAmount(event.target.value); setError(''); setConfirmed(null) }} /></Field>
      </FieldGroup>
      <dl className="paper-estimate">
        <div><dt>Available {side === 'buy' ? 'cash' : 'shares'}</dt><dd>{account ? side === 'buy' ? usd(account.buyingPower) : quantity(owned) : '—'}</dd></div>
        <div><dt>Est. order value</dt><dd>{usd(estimate && dollarsNumber(estimate.notionalCents))}</dd></div>
        <div><dt>Est. commission</dt><dd>{usd(estimate && dollarsNumber(estimate.commissionCents))}</dd></div>
        <div><dt>Slippage</dt><dd>{account ? `${account.costs.slippageBps} bps` : '—'}</dd></div>
        <div><dt>Est. {side === 'buy' ? 'total debit' : 'net proceeds'}</dt><dd>{usd(estimate && Math.abs(dollarsNumber(estimate.deltaCents)))}</dd></div>
      </dl>
      {inputError && <p id="paper-amount-error" className="paper-note negative" role="alert">{inputError}</p>}
      {!review && error && <p className="paper-note negative" role="alert">{error}</p>}
      <button ref={reviewSubmit} className="button primary paper-review-button" type="submit" disabled={busy || !estimate || Boolean(inputError) || !account}>{busy && !review ? 'Checking order…' : quoteLoading && !quote ? 'Verifying price…' : 'Review order'} <ChevronRight size={14} aria-hidden="true" /></button>
      <p className="paper-note paper-secure"><LockKeyhole size={12} aria-hidden="true" /> No real money or broker orders.</p>
      {confirmed && <p className="paper-note positive" role="status">Simulated {confirmed.side} filled: {quantity(confirmed.shares)} × {usd(confirmed.fillPrice, 6)}.</p>}
    </form>
    {review && <PaperDialog id="paper-review-title" busy={busy} onClose={closeReview}>
      <span className="eyebrow">Confirm simulation</span><h2 id="paper-review-title">{review.side === 'buy' ? 'Buy' : 'Sell'} {quantity(review.shares)} {review.quote.symbol.split(':')[0]}</h2>
      <p className="paper-note">{review.quote.source} · {review.quote.freshness} · {tradingPriceTime(review.quote.date)}. This price review is valid for 90 seconds.</p>
      <dl className="paper-estimate"><div><dt>Simulated fill price</dt><dd>{usd(review.fillPrice, 6)}</dd></div><div><dt>Order value</dt><dd>{usd(review.notional)}</dd></div><div><dt>Commission</dt><dd>{usd(review.commission)}</dd></div><div><dt>{review.cashChange < 0 ? 'Total cash debit' : 'Net proceeds'}</dt><dd>{usd(Math.abs(review.cashChange))}</dd></div></dl>
      {error && <p className="paper-note negative" role="alert">{error}</p>}
      <div className="paper-inline paper-dialog-actions"><button className="button" type="button" onClick={closeReview} disabled={busy}>Cancel</button><button className="button primary" type="button" disabled={busy} onClick={() => void confirm()}>{busy ? 'Confirming…' : 'Confirm simulated order'}</button></div>
    </PaperDialog>}
  </section>
}
