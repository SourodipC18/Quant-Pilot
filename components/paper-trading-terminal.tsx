'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Activity, FlaskConical, Search, ShieldCheck } from 'lucide-react'
import { instrumentSymbol, symbolParts, type Instrument } from '@/lib/market-instruments'
import { eligiblePaperType, tradingPriceTime, type PaperAccount, type PaperQuote } from '@/lib/paper-trading-types'
import { PaperAccountPanels, PaperAccountStrip } from './paper-account-panels'
import { paperEndpoint, paperPortfolioEndpoint, paperRequest, PaperOrderTicket, usd } from './paper-order-ticket'
import { PaperOrderDesk } from './paper-order-desk'
import { PaperPriceChart } from './paper-trading-charts'
import { marketCheckTime, marketRetryOptions, useMarketQuote } from './use-market-quote'

const startingInstrument: Instrument = { symbol: 'AAPL', instrument_name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD' }
const swrOptions = { revalidateOnFocus: false, shouldRetryOnError: false }
const windows = { '1M': 22, '3M': 66, '1Y': 252 } as const

type MarketHistory = { values: { datetime: string; close: string }[]; meta?: { currency?: string } }

export function PaperTradingTerminal({ workspaceReady, workspaceError, onRetryWorkspace }: { workspaceReady: boolean; workspaceError?: string; onRetryWorkspace: () => void }) {
  const { mutate } = useSWRConfig()
  const { data: account, error: accountError, mutate: reloadAccount } = useSWR<PaperAccount>(workspaceReady ? paperEndpoint : null, paperRequest, {
    ...marketRetryOptions, revalidateOnFocus: true, refreshInterval: data => data?.positions.length ? 300_000 : 0,
  })
  const [instrument, setInstrument] = useState(startingInstrument)
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [range, setRange] = useState<keyof typeof windows>('3M')
  const [view, setView] = useState<'positions' | 'trades' | 'performance' | 'journal'>('positions')
  const symbol = instrumentSymbol(instrument)
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query.trim()), 280)
    return () => clearTimeout(timer)
  }, [query])
  const queryKey = searchTerm.length >= 2 && query.trim() === searchTerm ? `/api/market?action=search&q=${encodeURIComponent(searchTerm)}` : null
  const { data: search, isLoading: searching, error: searchError } = useSWR<{ data: Instrument[]; warnings?: string[] }>(queryKey, paperRequest, swrOptions)
  const candidates = [...new Map((search?.data ?? []).filter(row => row.source === 'twelvedata' && row.currency === 'USD' && row.country === 'United States' && eligiblePaperType(row.instrument_type)).map(row => [instrumentSymbol(row), row])).values()].slice(0, 8)
  const quoteKey = workspaceReady ? `${paperEndpoint}?action=quote&symbol=${encodeURIComponent(symbol)}` : null
  const { data: marketQuote, isLoading: quoteLoading, error: quoteError, mutate: reloadQuote } = useMarketQuote<PaperQuote>(quoteKey, paperRequest)
  const quote = marketQuote?.quote
  const historyUrl = `/api/market?action=history&symbol=${encodeURIComponent(quote?.symbol ?? symbol)}&interval=1day&outputsize=260&adjust=none`
  const historyKey = quote ? [historyUrl, quote.freshness === 'End-of-day' ? quote.date : 'intraday'] as const : null
  const { data: history, isLoading: historyLoading, error: historyError, mutate: reloadChart } = useSWR<MarketHistory>(historyKey, ([url]) => paperRequest(url), { ...swrOptions, dedupingInterval: 300_000 })
  const values = useMemo(() => history?.meta?.currency === 'USD' ? history.values.filter(row => quote && (row.datetime < quote.date.slice(0, 10) || quote.freshness === 'End-of-day' && row.datetime === quote.date)).map(row => ({ datetime: row.datetime, close: Number(row.close) })).filter(row => row.close > 0 && Number.isFinite(row.close)).slice(-windows[range]) : [], [history, quote, range])
  const workspaceIssue = workspaceError ?? accountError?.message

  async function onUpdate() { await Promise.all([reloadAccount(), mutate(paperPortfolioEndpoint)]) }
  function select(item: Instrument) { setInstrument(item); setQuery('') }
  function openPosition(row: string) { select({ symbol: row, instrument_name: symbolParts(row).symbol, exchange: symbolParts(row).exchange, currency: 'USD' }); document.getElementById('paper-market')?.scrollIntoView({ block: 'nearest' }) }
  function showPositions() { setView('positions'); document.getElementById('paper-activity')?.scrollIntoView({ block: 'start' }) }

  return <div className="paper-terminal" aria-label="Trading terminal">
    <div className="paper-mode-banner"><span className="paper-sim"><FlaskConical size={14} aria-hidden="true" /> SIMULATION MODE</span><p>Trade with virtual USD. No orders are sent to a broker.</p><span className="paper-mode-exchange"><ShieldCheck size={14} aria-hidden="true" /> US stocks &amp; ETFs</span></div>
    <PaperAccountStrip account={account} positionsSelected={view === 'positions'} onSelectPositions={showPositions} />
    {workspaceIssue ? <div className="panel app-panel paper-problem" role="alert"><p>{workspaceIssue}</p><button className="button small" type="button" onClick={workspaceError ? onRetryWorkspace : () => void reloadAccount()}>Retry account</button></div> : !account && <p className="paper-note" role="status">Opening your account…</p>}
    <div className="paper-terminal-grid">
      <section className="panel app-panel paper-market" id="paper-market" aria-labelledby="paper-market-title">
        <header className="app-panel-header paper-market-header"><div><span className="eyebrow">01 / Market workspace</span><h2 id="paper-market-title">Market chart</h2></div><div className="instrument-search paper-search"><Search size={14} aria-hidden="true" /><input aria-label="Search USD stocks and ETFs" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search symbol" maxLength={80} autoComplete="off" onKeyDown={event => { if (event.key === 'Escape') setQuery('') }} />
          {queryKey && <div className="instrument-suggestions" aria-label="USD instrument search results">{candidates.map(item => <button type="button" key={instrumentSymbol(item)} onClick={() => select(item)}><strong>{item.symbol}</strong><span>{item.instrument_name} · {item.exchange}</span></button>)}{!candidates.length && <p className="paper-search-note" role="status">{searching ? 'Searching…' : searchError?.message ?? (search?.warnings?.length ? 'No verified USD results. Some listings could not be searched.' : 'No matching US stocks or ETFs.')}</p>}</div>}
        </div></header>
        <div className="paper-instrument-row"><div className="instrument-current"><span className="ticker-badge">{symbolParts(symbol).symbol}</span><div><strong>{instrument.instrument_name}</strong><small>{instrument.exchange} · USD</small></div></div><div className="paper-inline paper-periods" role="group" aria-label="Chart range">{(Object.keys(windows) as (keyof typeof windows)[]).map(item => <button type="button" className="button small" key={item} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}</div></div>
        <div className="paper-market-price"><strong>{usd(quote?.price, 4)}</strong><span className="paper-tag paper-freshness"><Activity size={12} aria-hidden="true" /> {marketQuote && quote?.freshness==='5-minute bar'?(marketQuote.checkedAt-Date.parse(quote.date)>=300000?'Delayed 5-minute bar':'Recent 5-minute bar · not live'):quote?.freshness ?? (quoteLoading ? 'Verifying price' : 'Price unavailable')}</span></div>
        <p className="paper-note paper-source">Twelve Data{quote ? ` · Price as of ${tradingPriceTime(quote.date)}` : ' · Verified price required'}{quoteError ? ' · Price refresh unavailable' : marketQuote ? ` · Checked ${marketCheckTime(marketQuote.checkedAt)}` : ''}{quoteError ? <button className="text-button" type="button" onClick={() => void reloadQuote()}>Retry price</button> : historyError ? <button className="text-button" type="button" onClick={() => void reloadChart()}>Retry chart</button> : null}</p>
        {(!quote && quoteError) || historyError ? <div className="paper-plot-state" role="alert">{historyError?.message ?? quoteError?.message}</div> : quoteLoading || historyLoading || !workspaceReady && !workspaceError ? <div className="paper-plot-state" role="status">Loading market history…</div> : values.length ? <PaperPriceChart values={quote?.freshness === '5-minute bar' ? [...values, {datetime:quote.date.slice(0,10),close:quote.price}] : values} account={account} symbol={quote?.symbol??symbol} /> : <div className="paper-plot-state">No verified USD chart history is available.</div>}
        {account&&<><PaperOrderDesk key={account.accountId+symbol} account={account} symbol={quote?.symbol??symbol} price={quote?.price} reload={onUpdate}/>{account.positions.filter(p=>p.symbol===quote?.symbol).map(p=><p className="paper-note" key={p.symbol}>{p.shares} shares · Average entry {usd(p.averageCost)} · Open P&L {usd(p.unrealized)}</p>)}</>}
        <p className="paper-note">Prices are checked every minute while this tab is visible. The chart shows daily closes plus the latest verified five-minute mark when available. B and S mark simulated buys and sells.</p>
      </section>
      <PaperOrderTicket key={`${account?.accountId ?? 'pending'}:${symbol}`} {...{ symbol, account, quote, quoteLoading }} onFill={() => { setView('positions'); void onUpdate() }} />
    </div>
    {account && <PaperAccountPanels account={account} view={view} onView={setView} onUpdate={onUpdate} onPosition={openPosition} />}
  </div>
}
