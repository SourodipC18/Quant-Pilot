'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Database, LineChart, LoaderCircle, Moon, RefreshCw, Search, Sun, X } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Instrument = { symbol?: string; instrument_name?: string; exchange?: string; country?: string; currency?: string; type?: string; instrument_type?: string }
type Bar = { datetime: string; open: string; high: string; low: string; close: string; volume?: string }

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
    if (value.length < 2) { setResults([]); return }
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

  const chartData = useMemo(() => bars.map(bar => ({ date: bar.datetime.slice(0, 10), close: Number(bar.close) })).filter(row => Number.isFinite(row.close)), [bars])
  const latest = chartData.at(-1)?.close
  const first = chartData[0]?.close
  const returnValue = latest && first ? ((latest / first - 1) * 100).toFixed(2) : null

  return <div className={`app-shell ${dark ? 'dark' : 'light'}`}>
    <aside className="sidebar"><div className="brand-row"><div className="brand-mark"><span>Q</span></div><div><div className="brand-name">QuantPilot</div><div className="brand-sub">RESEARCH TERMINAL</div></div></div><div className="workspace-pill"><span className="workspace-dot" /><span>Live market workspace</span><ChevronDown className="tiny-icon" /></div><nav className="nav-list"><div className="nav-label">Workspace</div>{['Overview', 'Research Workbench', 'Model Lab', 'Backtesting Studio', 'Portfolio Risk', 'Experiments'].map((label, index) => <button key={label} className={`nav-item ${index === 1 ? 'selected' : ''}`}><LineChart />{label}</button>)}<div className="nav-label nav-label-spaced">System</div><button className="nav-item"><Database />Data Sources</button></nav><div className="sidebar-bottom"><div className="status-box"><div className="status-line"><span className={`status-dot ${configured ? '' : 'status-off'}`} />{configured ? 'Provider configured' : 'Setup required'}</div><span>Twelve Data server connection</span></div></div></aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><span>Research</span><strong>Research Workbench</strong></div><div className="topbar-actions"><div className="freshness"><span className="status-dot" />Provider status</div><button className="top-icon" aria-label="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</button><div className="top-avatar">AR</div></div></header>
      <div className="content-wrap"><div className="page-heading"><div><div className="kicker"><span className="demo-badge live-badge">LIVE PROVIDER</span><span>Source-backed research only</span></div><h1>Research Workbench</h1><p>Search an exchange-qualified instrument and load its actual historical observations.</p></div><button className="button secondary" onClick={() => instrument && selectInstrument(instrument)} disabled={!instrument || loading}><RefreshCw />Refresh data</button></div>
        {configured === false && <section className="setup-card panel"><AlertTriangle /><div><h2>Market data is not configured</h2><p>Market data is not configured. Add your Twelve Data API key to the server environment to begin researching real instruments.</p><small>Configure <code>TWELVE_DATA_API_KEY</code> and restart the server. The key is never sent to the browser.</small></div></section>}
        <section className="instrument-bar panel"><div className="instrument-main"><div className="ticker">{instrument?.symbol ?? '—'}</div><div><div className="instrument-title">{instrument?.instrument_name ?? 'Select a market instrument'} <span className="asset-type">{instrument?.instrument_type ?? instrument?.type ?? 'Provider search'}</span></div><div className="instrument-meta"><span className="status-dot" />{instrument ? `${instrument.exchange ?? 'Exchange unavailable'} · ${instrument.country ?? 'Market unavailable'} · ${instrument.currency ?? 'Currency unavailable'}` : 'No instrument selected'}</div></div></div><div className="instrument-stats"><div><span>Latest close</span><strong>{latest ? latest.toFixed(2) : '—'}</strong></div><div><span>Period return</span><strong className={returnValue && Number(returnValue) >= 0 ? 'positive' : 'warning'}>{returnValue ? `${Number(returnValue) >= 0 ? '+' : ''}${returnValue}%` : '—'}</strong></div><div><span>Observations</span><strong>{bars.length || '—'}</strong></div></div></section>
        <div className="search-panel panel"><label className="search-label" htmlFor="instrument-search">Search and select a company</label><div className="search-box"><Search /><input id="instrument-search" type="search" value={query} onChange={event => { setQuery(event.target.value); if (instrument && event.target.value !== instrument.symbol) setInstrument(null) }} placeholder="Search company name, ticker, or exchange" autoComplete="off" aria-controls="company-search-results" aria-expanded={results.length > 0} /><span>{searching ? <LoaderCircle className="spin" /> : query && <button className="clear-search" type="button" aria-label="Clear company search" onClick={() => { setQuery(''); setResults([]); setInstrument(null); setBars([]); setError('') }}><X /></button>}</span></div>{results.length > 0 && <div className="search-results" id="company-search-results" role="listbox" aria-label="Company search results">{results.map((item, index) => <button type="button" role="option" aria-selected={instrument?.symbol === item.symbol} key={`${item.symbol}-${item.exchange}-${index}`} onClick={() => selectInstrument(item)}><span className="result-heading"><strong>{item.instrument_name ?? 'Name unavailable'}</strong>{instrument?.symbol === item.symbol && <Check />}</span><span><b>{item.symbol}</b> · {item.exchange ?? 'Exchange unavailable'} · {item.country ?? 'Country unavailable'}</span></button>)}</div>}{instrument && <p className="selected-company"><Check /> Selected: <strong>{instrument.instrument_name ?? instrument.symbol}</strong> ({instrument.symbol})</p>}{query.length > 1 && !instrument && !searching && !results.length && !error && <p className="empty-state">No companies matched this provider search.</p>}</div>
        {error && <div className="error-card panel"><AlertTriangle /><span>{error}</span><button className="button secondary" onClick={() => instrument && selectInstrument(instrument)}>Retry</button></div>}
        <section className="chart-panel panel"><div className="chart-header"><div><div className="panel-title-row"><h2>Price history</h2><span className="data-chip">{instrument ? `${instrument.symbol} / DAILY` : 'NO DATA'}</span></div><p className="panel-subtitle">Chronological close observations returned by Twelve Data</p></div><div className="range-tabs">{['1M', '3M', '6M', '1Y', 'All'].map(item => <button key={item} className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item}</button>)}</div></div><div className="chart-wrap">{loading ? <div className="loading-state"><LoaderCircle className="spin" />Loading provider history…</div> : chartData.length ? <ResponsiveContainer width="100%" height={280}><AreaChart data={chartData}><defs><linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent-blue)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--accent-blue)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} /><XAxis dataKey="date" stroke="var(--chart-axis)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={30} /><YAxis stroke="var(--chart-axis)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><Tooltip contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--foreground)', fontSize: 12 }} /><Area type="monotone" dataKey="close" stroke="var(--accent-blue)" fill="url(#marketFill)" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Database />Select an instrument to load real historical data.</div>}</div><div className="chart-footer"><span>Source: Twelve Data</span><span>{bars.length ? `Latest observation · ${bars.at(-1)?.datetime}` : 'Data freshness unavailable'}</span></div></section>
        <footer className="disclosure"><AlertTriangle /><span>QuantPilot is a historical research and paper simulation tool. Provider availability, delays, coverage, and entitlements follow your Twelve Data plan. Results are not financial advice.</span></footer>
      </div></main>
  </div>
}
