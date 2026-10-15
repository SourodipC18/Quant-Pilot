'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Database, LineChart, LoaderCircle, Moon, RefreshCw, Search, Sun, X } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Instrument = { symbol?: string; instrument_name?: string; exchange?: string; country?: string; currency?: string; type?: string; instrument_type?: string }
type Bar = { datetime: string; open: string; high: string; low: string; close: string; volume?: string }

const popularCompanies: Instrument[] = [
  { symbol: 'AAPL', instrument_name: 'Apple Inc.', exchange: 'NASDAQ', country: 'United States', currency: 'USD', type: 'Common Stock' },
  { symbol: 'MSFT', instrument_name: 'Microsoft Corporation', exchange: 'NASDAQ', country: 'United States', currency: 'USD', type: 'Common Stock' },
  { symbol: 'NVDA', instrument_name: 'NVIDIA Corporation', exchange: 'NASDAQ', country: 'United States', currency: 'USD', type: 'Common Stock' },
  { symbol: 'TSLA', instrument_name: 'Tesla, Inc.', exchange: 'NASDAQ', country: 'United States', currency: 'USD', type: 'Common Stock' },
]

function formatError(error: unknown) { return error instanceof Error ? error.message : 'Unable to load market data.' }

export default function Page() {
  const [dark, setDark] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Instrument[]>([])
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [bars, setBars] = useState<Bar[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [range, setRange] = useState('6M')

  useEffect(() => { fetch('/api/market?action=status').then(r => r.json()).then(data => setConfigured(data.configured)).catch(() => setConfigured(false)) }, [])
  useEffect(() => {
    const value = query.trim()
    if (value.length < 2 || instrument?.symbol === value) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true); setError('')
      try { const response = await fetch(`/api/market?action=search&q=${encodeURIComponent(value)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setResults(data.data ?? []) } catch (reason) { setError(formatError(reason)); setResults([]) } finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  async function selectInstrument(item: Instrument) {
    setInstrument(item); setQuery(item.symbol ?? ''); setResults([]); setLoading(true); setError('')
    try { const response = await fetch(`/api/market?action=history&symbol=${encodeURIComponent(item.symbol ?? '')}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setBars(data.values ?? []) } catch (reason) { setBars([]); setError(formatError(reason)) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (configured && !instrument) selectInstrument(popularCompanies[0])
  }, [configured])

  const chartData = useMemo(() => bars.map(bar => ({ date: bar.datetime.slice(0, 10), close: Number(bar.close), high: Number(bar.high), low: Number(bar.low), volume: Number(bar.volume ?? 0) })).filter(row => Number.isFinite(row.close)), [bars])
  const visibleData = useMemo(() => {
    const counts: Record<string, number> = { '1M': 22, '3M': 66, '6M': 132, '1Y': 252 }
    return range === 'All' ? chartData : chartData.slice(-(counts[range] ?? chartData.length))
  }, [chartData, range])
  const latest = visibleData.at(-1)?.close
  const first = visibleData[0]?.close
  const returnValue = latest && first ? ((latest / first - 1) * 100).toFixed(2) : null
  const dailyReturns = visibleData.slice(1).map((row, index) => row.close / visibleData[index].close - 1).filter(Number.isFinite)
  const volatility = dailyReturns.length > 1 ? Math.sqrt(dailyReturns.reduce((sum, value) => sum + value ** 2, 0) / dailyReturns.length) * Math.sqrt(252) * 100 : null
  const high = visibleData.length ? Math.max(...visibleData.map(row => row.high || row.close)) : null
  const low = visibleData.length ? Math.min(...visibleData.map(row => row.low || row.close)) : null
  const maxDrawdown = visibleData.reduce((state, row) => { const peak = Math.max(state.peak, row.close); return { peak, drawdown: Math.min(state.drawdown, row.close / peak - 1) } }, { peak: 0, drawdown: 0 }).drawdown * 100
  const averageVolume = visibleData.length ? visibleData.reduce((sum, row) => sum + row.volume, 0) / visibleData.length : null
  const sma20 = visibleData.length >= 20 ? visibleData.slice(-20).reduce((sum, row) => sum + row.close, 0) / 20 : null
  const trend = latest && sma20 ? latest >= sma20 ? 'Bullish' : 'Bearish' : 'Awaiting data'
  const formatNumber = (value: number | null, digits = 2) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits })
  const formatVolume = (value: number | null) => value == null ? '—' : value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : formatNumber(value, 0)
  const analysisReady = Boolean(instrument && visibleData.length)

  const runAnalysis = () => {
    if (instrument) selectInstrument(instrument)
  }

  return <div className={`app-shell ${dark ? 'dark' : 'light'}`}>
    <aside className="sidebar"><div className="brand-row"><div className="brand-mark"><span>Q</span></div><div><div className="brand-name">QuantPilot</div><div className="brand-sub">RESEARCH TERMINAL</div></div></div><div className="workspace-pill"><span className="workspace-dot" /><span>Live market workspace</span><ChevronDown className="tiny-icon" /></div><nav className="nav-list"><div className="nav-label">Workspace</div>{['Overview', 'Research Workbench', 'Model Lab', 'Backtesting Studio', 'Portfolio Risk', 'Experiments'].map((label, index) => <button key={label} className={`nav-item ${index === 1 ? 'selected' : ''}`}><LineChart />{label}</button>)}<div className="nav-label nav-label-spaced">System</div><button className="nav-item"><Database />Data Sources</button></nav><div className="sidebar-bottom"><div className="status-box"><div className="status-line"><span className={`status-dot ${configured ? '' : 'status-off'}`} />{configured ? 'Provider configured' : 'Setup required'}</div><span>Twelve Data server connection</span></div></div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><span>Research</span><strong>Research Workbench</strong></div><div className="topbar-actions"><div className="freshness"><span className="status-dot" />Provider status</div><button className="top-icon" aria-label="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</button><div className="top-avatar">AR</div></div></header>
      <div className="content-wrap"><div className="page-heading"><div><div className="kicker"><span className="demo-badge live-badge">LIVE PROVIDER</span><span>Source-backed research only</span></div><h1>Research Workbench</h1><p>Search an exchange-qualified instrument and load its actual historical observations.</p></div><button className="button secondary" onClick={() => instrument && selectInstrument(instrument)} disabled={!instrument || loading}><RefreshCw />Refresh data</button></div>
        {configured === false && <section className="setup-card panel"><AlertTriangle /><div><h2>Market data is not configured</h2><p>Market data is not configured. Add your Twelve Data API key to the server environment to begin researching real instruments.</p><small>Configure <code>TWELVE_DATA_API_KEY</code> and restart the server. The key is never sent to the browser.</small></div></section>}
        <section className="instrument-bar panel"><div className="instrument-main"><div className="ticker">{instrument?.symbol ?? '—'}</div><div><div className="instrument-title">{instrument?.instrument_name ?? 'Select a market instrument'} <span className="asset-type">{instrument?.instrument_type ?? instrument?.type ?? 'Provider search'}</span></div><div className="instrument-meta"><span className="status-dot" />{instrument ? `${instrument.exchange ?? 'Exchange unavailable'} · ${instrument.country ?? 'Market unavailable'} · ${instrument.currency ?? 'Currency unavailable'}` : 'No instrument selected'}</div></div></div><div className="instrument-stats"><div><span>Latest close</span><strong>{latest ? latest.toFixed(2) : '—'}</strong></div><div><span>Period return</span><strong className={returnValue && Number(returnValue) >= 0 ? 'positive' : 'warning'}>{returnValue ? `${Number(returnValue) >= 0 ? '+' : ''}${returnValue}%` : '—'}</strong></div><div><span>Observations</span><strong>{bars.length || '—'}</strong></div></div></section>
        <div className="search-panel panel"><label className="search-label" htmlFor="instrument-search">Search and select a company</label><div className="quick-companies" aria-label="Popular companies">{popularCompanies.map(item => <button type="button" key={item.symbol} className={instrument?.symbol === item.symbol ? 'active' : ''} onClick={() => selectInstrument(item)}>{item.symbol}</button>)}</div><div className="search-box"><Search /><input id="instrument-search" type="search" value={query} onChange={event => { setQuery(event.target.value); if (instrument && event.target.value !== instrument.symbol) setInstrument(null) }} placeholder="Search company name, ticker, or exchange" autoComplete="off" aria-controls="company-search-results" aria-expanded={results.length > 0} /><span>{searching ? <LoaderCircle className="spin" /> : query && <button className="clear-search" type="button" aria-label="Clear company search" onClick={() => { setQuery(''); setResults([]); setInstrument(null); setBars([]); setError('') }}><X /></button>}</span></div>{results.length > 0 && <div className="search-results" id="company-search-results" role="listbox" aria-label="Company search results">{results.map((item, index) => <button type="button" role="option" aria-selected={instrument?.symbol === item.symbol} key={`${item.symbol}-${item.exchange}-${index}`} onClick={() => selectInstrument(item)}><span className="result-heading"><strong>{item.instrument_name ?? 'Name unavailable'}</strong>{instrument?.symbol === item.symbol && <Check />}</span><span><b>{item.symbol}</b> · {item.exchange ?? 'Exchange unavailable'} · {item.country ?? 'Country unavailable'}</span></button>)}</div>}{instrument && <p className="selected-company"><Check /> Selected: <strong>{instrument.instrument_name ?? instrument.symbol}</strong> ({instrument.symbol})</p>}{query.length > 1 && !instrument && !searching && !results.length && !error && <p className="empty-state">No companies matched this provider search.</p>}</div>
        {error && <div className="error-card panel"><AlertTriangle /><span>{error}</span><button className="button secondary" onClick={() => instrument && selectInstrument(instrument)}>Retry</button></div>}
        <section className="chart-panel panel"><div className="chart-header"><div><div className="panel-title-row"><h2>Price history</h2><span className="data-chip">{instrument ? `${instrument.symbol} / DAILY` : 'NO DATA'}</span></div><p className="panel-subtitle">Chronological close observations returned by Twelve Data</p></div><div className="range-tabs">{['1M', '3M', '6M', '1Y', 'All'].map(item => <button key={item} className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item}</button>)}</div></div><div className="chart-wrap">{loading ? <div className="loading-state"><LoaderCircle className="spin" />Loading provider history…</div> : visibleData.length ? <ResponsiveContainer width="100%" height={280}><AreaChart data={visibleData}><defs><linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent-blue)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--accent-blue)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" stroke="var(--chart-axis)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={30} /><YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12 }} /><Area type="monotone" dataKey="close" stroke="var(--accent-blue)" fill="url(#marketFill)" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Database />Select an instrument to load real historical data.</div>}</div><div className="chart-footer"><span>Source: Twelve Data</span><span>{bars.length ? `Latest observation · ${bars.at(-1)?.datetime}` : 'Data freshness unavailable'}</span></div></section>
        <section className="analysis-canvas">
          <div className="panel metric-strip">
            <div className="metric"><span className="eyebrow">Period return</span><strong className={returnValue && Number(returnValue) >= 0 ? 'positive' : 'warning'}>{returnValue ? `${Number(returnValue) >= 0 ? '+' : ''}${returnValue}%` : '—'}</strong><span className="metric-detail">{range} price change</span></div>
            <div className="metric"><span className="eyebrow">Annualized volatility</span><strong>{volatility == null ? '—' : `${volatility.toFixed(1)}%`}</strong><span className="metric-detail">Close-to-close estimate</span></div>
            <div className="metric"><span className="eyebrow">Max drawdown</span><strong className="warning">{analysisReady ? `${maxDrawdown.toFixed(1)}%` : '—'}</strong><span className="metric-detail">Peak-to-trough</span></div>
            <div className="metric"><span className="eyebrow">Trend signal</span><strong className={trend === 'Bullish' ? 'positive' : trend === 'Bearish' ? 'warning' : ''}>{trend}</strong><span className="metric-detail">20-day SMA comparison</span></div>
            <div className="metric"><span className="eyebrow">Avg volume</span><strong>{formatVolume(averageVolume)}</strong><span className="metric-detail">Daily average</span></div>
          </div>
          <div className="lower-grid">
            <section className="panel checks-panel"><div className="panel-header"><div><div className="eyebrow">Quant analysis</div><h2>Research checks</h2></div><button className="button secondary small" onClick={runAnalysis} disabled={!instrument || loading}><RefreshCw />{loading ? 'Loading data' : 'Run analysis'}</button></div><div className="check-list">
              <div><span className={analysisReady ? 'check-icon' : 'warning-icon'}>{analysisReady ? <Check /> : <AlertTriangle />}</span><div><strong>Data availability</strong><small>{analysisReady ? `${visibleData.length} observations loaded for ${instrument?.symbol}` : loading ? `Loading price history for ${instrument?.symbol ?? 'selected company'}` : error ? 'Could not load this company’s price history' : instrument ? `Ready to load ${instrument.symbol} price history` : 'Select a company to begin'}</small></div><b className={analysisReady ? 'positive' : 'warning'}>{analysisReady ? 'PASS' : loading ? 'LOADING' : error ? 'ERROR' : 'WAITING'}</b></div>
              <div><span className={analysisReady && volatility != null ? 'check-icon' : 'warning-icon'}>{analysisReady && volatility != null ? <Check /> : <AlertTriangle />}</span><div><strong>Risk profile</strong><small>{loading ? 'Calculating from daily returns' : volatility == null ? instrument ? 'Requires loaded price history' : 'Select a company first' : `Annualized volatility: ${volatility.toFixed(1)}%`}</small></div><b className={volatility != null ? 'positive' : 'warning'}>{volatility != null ? 'READY' : loading ? 'WAITING' : 'WAITING'}</b></div>
              <div><span className={analysisReady ? 'check-icon' : 'warning-icon'}>{analysisReady ? <Check /> : <AlertTriangle />}</span><div><strong>Trend and drawdown</strong><small>{loading ? 'Calculating trend and drawdown' : analysisReady ? `${trend} · ${maxDrawdown.toFixed(1)}% maximum drawdown` : instrument ? 'Requires loaded price history' : 'Select a company first'}</small></div><b className={analysisReady ? 'positive' : 'warning'}>{analysisReady ? 'READY' : loading ? 'WAITING' : 'WAITING'}</b></div>
            </div></section>
            <section className="panel confidence-panel"><div className="panel-header"><div><div className="eyebrow">Range statistics</div><h2>{instrument ? `${instrument.symbol} distribution` : 'Select an instrument'}</h2></div><span className="data-chip">{range}</span></div><div className="check-list"><div><div><strong>Highest close</strong><small>Observed in selected range</small></div><b>{formatNumber(high)}</b></div><div><div><strong>Lowest close</strong><small>Observed in selected range</small></div><b>{formatNumber(low)}</b></div><div><div><strong>20-day average</strong><small>Simple moving average</small></div><b>{formatNumber(sma20)}</b></div><div><div><strong>Observations</strong><small>Provider records used</small></div><b>{visibleData.length || '—'}</b></div></div></section>
          </div>
        </section>
        <footer className="disclosure"><AlertTriangle /><span>QuantPilot is a historical research and paper simulation tool. Provider availability, delays, coverage, and entitlements follow your Twelve Data plan. Results are not financial advice.</span></footer>
      </div></main>
  </div>
}
