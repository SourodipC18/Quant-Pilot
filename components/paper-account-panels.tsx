'use client'

import { useState } from 'react'
import { ArrowDownToLine, ChartNoAxesCombined, Clock3, RefreshCw, RotateCcw, Settings2 } from 'lucide-react'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { PaperEquityHistory } from './paper-trading-charts'
import { PaperDialog, paperEndpoint, paperRequest, quantity, usd } from './paper-order-ticket'
import type { PaperAccount } from '@/lib/paper-trading-types'

const pct = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 4, signDisplay: 'exceptZero' })
const tone = (value: number) => value > 0 ? 'positive' : value < 0 ? 'negative' : undefined

export function PaperAccountStrip({ account, positionsSelected, onSelectPositions }: { account?: PaperAccount; positionsSelected: boolean; onSelectPositions: () => void }) {
  return <section className="paper-account-strip panel" aria-label="Paper account summary">
    <div className="paper-account-lead"><span className="eyebrow">Paper account <span className="paper-live-dot" /></span><strong>{usd(account?.equity)}</strong><small>Account equity · USD</small></div>
    <div><span>Buying power</span><strong>{usd(account?.buyingPower)}</strong><small>Cash only · 1×</small></div>
    <div><span>Total return</span><strong className={account && tone(account.totalReturn)}>{account ? pct.format(account.totalReturn) : '—'}</strong><small>Since account opened</small></div>
    <button type="button" className="paper-position-link" onClick={onSelectPositions} aria-pressed={positionsSelected}><span>Open positions</span><strong>{account?.positions.length ?? '—'}</strong><small>View holdings →</small></button>
  </section>
}

type ActivityView = 'positions' | 'trades' | 'performance'
const views: { key: ActivityView; label: string }[] = [{ key: 'positions', label: 'Open positions' }, { key: 'trades', label: 'Transaction history' }, { key: 'performance', label: 'Account performance' }]

export function PaperAccountPanels({ account, view, onView, onUpdate, onPosition }: {
  account: PaperAccount; view: ActivityView; onView: (view: ActivityView) => void; onUpdate: () => Promise<unknown>; onPosition: (symbol: string) => void;
}) {
  const [dialog, setDialog] = useState<'costs' | 'reset' | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [commission, setCommission] = useState('0')
  const [slippage, setSlippage] = useState('0')
  const [reset, setReset] = useState('')

  function close() { setDialog(null); setError('') }
  function open(next: 'costs' | 'reset') {
    setNote(''); setError(''); setReset(''); setCommission(String(account.costs.commissionBps)); setSlippage(String(account.costs.slippageBps)); setDialog(next)
  }
  async function run(action: 'refresh' | 'costs' | 'reset') {
    if (busy) return
    setBusy(true); setNote(''); setError('')
    try {
      const result = await paperRequest<{ updated?: number; unavailable?: number }>(paperEndpoint, { action, accountId: account.accountId, ...(action === 'costs' ? { commissionBps: Number(commission), slippageBps: Number(slippage) } : action === 'reset' ? { confirmation: reset } : {}) })
      close()
      setNote(action === 'reset' ? 'Paper account reset to $5,000,000.00.' : action === 'costs' ? 'Simulation costs saved.' : result.unavailable ? `${result.updated ?? 0} marks updated. ${result.unavailable} positions kept their last verified mark because a fresh close was unavailable.` : result.updated ? `${result.updated} position marks updated.` : 'Position marks are already up to date.')
      await onUpdate()
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to update the paper account.') }
    finally { setBusy(false) }
  }

  const metrics: { label: string; value: string; detail: string }[] = [
    { label: 'Available cash', value: usd(account.cash), detail: 'Uninvested virtual cash' },
    { label: 'Invested capital', value: usd(account.invested), detail: 'Open-position cost basis, including buy fees' },
    { label: 'Portfolio market value', value: usd(account.marketValue), detail: 'Open positions at last verified closes' },
    { label: 'Realized P&L', value: usd(account.realized), detail: 'Net of simulated fees' },
    { label: 'Unrealized P&L', value: usd(account.unrealized), detail: 'Market value less open cost basis' },
    { label: 'Completed trades', value: account.completedTrades.toLocaleString('en-US'), detail: 'Simulated market fills' },
  ]

  return <section className="panel app-panel paper-activity" id="paper-activity" aria-labelledby="paper-activity-heading">
    <header className="app-panel-header"><div><span className="eyebrow">03 / Account &amp; activity</span><h2 id="paper-activity-heading">Trading ledger</h2></div><div className="paper-inline paper-actions">
      <button className="button small" type="button" disabled={busy} onClick={() => open('costs')}><Settings2 size={14} aria-hidden="true" /> Costs</button>
      <button className="button small" type="button" disabled={busy} onClick={() => open('reset')}><RotateCcw size={14} aria-hidden="true" /> Reset account</button>
    </div></header>
    <div className="paper-activity-tabs" role="group" aria-label="Trading ledger view">{views.map(tab => <button type="button" key={tab.key} aria-pressed={view === tab.key} onClick={() => onView(tab.key)}>{tab.label}</button>)}</div>
    {note && <p className="paper-note" role="status">{note}</p>}{!dialog && error && <p className="paper-note negative" role="alert">{error}</p>}
    {view === 'positions' && <>
      <div className="paper-activity-meta"><p className="paper-note">Last verified end-of-day marks. Valuation includes positions only, not cash.</p><button className="button small" type="button" disabled={busy || !account.positions.length} onClick={() => void run('refresh')}><RefreshCw size={13} aria-hidden="true" /> {busy ? 'Refreshing…' : 'Refresh marks'}</button></div>
      {account.positions.length ? <div className="table-scroll"><table className="data-table"><caption className="sr-only">Open simulated positions in USD</caption><thead><tr><th>Symbol</th><th>Shares</th><th>Avg. cost</th><th>Last EOD mark</th><th>Market value</th><th>Unrealized P&amp;L</th></tr></thead><tbody>{account.positions.map(row => <tr key={row.symbol}>
        <td><button type="button" className="text-button" onClick={() => onPosition(row.symbol)}>{row.symbol}</button></td><td>{quantity(row.shares)}</td><td>{usd(row.averageCost, 4)}</td><td>{usd(row.mark, 4)} <small className="paper-table-note">{row.markDate}</small></td><td>{usd(row.marketValue)}</td><td className={tone(row.unrealized)}>{usd(row.unrealized)}</td>
      </tr>)}</tbody></table></div> : <div className="paper-empty"><ChartNoAxesCombined size={19} aria-hidden="true" /><strong>No open positions</strong><p>Fill a simulated buy to add your first holding.</p></div>}
    </>}
    {view === 'trades' && <>
      <div className="paper-activity-meta"><p className="paper-note">{account.completedTrades > 50 ? 'Showing the latest 50 fills. Export CSV for the full ledger.' : `${account.completedTrades} completed simulated ${account.completedTrades === 1 ? 'trade' : 'trades'}.`}</p><a className="button small" href={`${paperEndpoint}?action=csv`} download><ArrowDownToLine size={13} aria-hidden="true" /> Export CSV</a></div>
      {account.trades.length ? <div className="table-scroll"><table className="data-table"><caption className="sr-only">Completed simulated market fills in USD</caption><thead><tr><th>Executed</th><th>Symbol</th><th>Side</th><th>Shares</th><th>Fill price</th><th>Commission</th><th>Realized P&amp;L</th></tr></thead><tbody>{account.trades.map(row => <tr key={row.id}>
        <td><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time></td><td>{row.symbol}</td><td className={row.side === 'buy' ? 'positive' : 'negative'}>{row.side === 'buy' ? 'Buy' : 'Sell'}</td><td>{quantity(row.shares)}</td><td>{usd(row.fillPrice, 6)}<small className="paper-table-note">EOD {row.markDate}</small></td><td>{usd(row.commission)}</td><td className={row.realized == null ? undefined : tone(row.realized)}>{usd(row.realized)}</td>
      </tr>)}</tbody></table></div> : <div className="paper-empty"><Clock3 size={19} aria-hidden="true" /><strong>No completed trades</strong><p>Confirmed simulated orders will appear here.</p></div>}
    </>}
    {view === 'performance' && <>
      <div className="paper-metrics">{metrics.map(metric => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</div>
      <PaperEquityHistory history={account.history} />
      <p className="paper-note">Equity includes cash. History uses the opening balance, simulated market fills and changes to verified position marks. It does not backfill market movements between those events.</p>
    </>}
    {dialog && <PaperDialog id="paper-control-title" busy={busy} onClose={close}>
      <span className="eyebrow">Paper account settings</span><h2 id="paper-control-title">{dialog === 'reset' ? 'Reset paper account?' : 'Simulation costs'}</h2>
      <p className="paper-note">{dialog === 'reset' ? 'This deletes all simulated trades, positions and history, resets costs to zero, and restores $5,000,000.00. Saved research and portfolios are not affected.' : 'Both costs are per fill in basis points (100 bps = 1%). Slippage moves the simulated fill against your order.'}</p>
      <form onSubmit={event => { event.preventDefault(); void run(dialog) }}>
        <FieldGroup className="paper-entry">{dialog === 'costs' ? <>
          <Field><FieldLabel htmlFor="paper-commission">Commission (bps)</FieldLabel><input id="paper-commission" type="number" min="0" max="100" step="1" required value={commission} onChange={event => setCommission(event.target.value)} /></Field>
          <Field><FieldLabel htmlFor="paper-slippage">Slippage (bps)</FieldLabel><input id="paper-slippage" type="number" min="0" max="100" step="1" required value={slippage} onChange={event => setSlippage(event.target.value)} /></Field>
        </> : <Field><FieldLabel htmlFor="paper-reset">Type RESET to confirm</FieldLabel><input id="paper-reset" value={reset} autoComplete="off" onChange={event => setReset(event.target.value)} /></Field>}</FieldGroup>
        {error && <p className="paper-note negative" role="alert">{error}</p>}
        <div className="paper-inline paper-dialog-actions"><button className="button" type="button" disabled={busy} onClick={close}>Cancel</button><button className={`button ${dialog === 'reset' ? 'danger-button' : 'primary'}`} type="submit" disabled={busy || (dialog === 'reset' && reset !== 'RESET')}>{busy ? 'Saving…' : dialog === 'reset' ? 'Reset paper account' : 'Save costs'}</button></div>
      </form>
    </PaperDialog>}
  </section>
}
