'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
type MarketInterval = '1min' | '5min' | '15min' | '30min' | '45min' | '1h' | '2h' | '4h' | '1day' | '1week' | '1month'
type PriceAdjustment = 'all' | 'splits' | 'dividends' | 'none'
type MarketBar = { datetime: string; open: string; high: string; low: string; close: string; volume: string | null }
type MarketQuality = { status: 'available' | 'warning' | 'unavailable'; observations: number; missingObservations: number | null; missingPercentage: number | null; duplicates: number; invalidOhlc: number; abnormalMoves: number; missingVolume: number; latestObservation: string | null; stale: boolean | null; coverageStart: string | null; coverageEnd: string | null; warnings: string[] }
type QualityResponse = { values?: MarketBar[]; meta?: Record<string, unknown>; source?: string; lastSyncedAt?: string; interval?: MarketInterval; adjustment?: PriceAdjustment; quality?: MarketQuality; error?: string }
const intervals: MarketInterval[] = ['1min', '5min', '15min', '30min', '45min', '1h', '2h', '4h', '1day', '1week', '1month']
const fetcher = async (url: string): Promise<QualityResponse> => { const response = await fetch(url); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Unable to retrieve market history.'); return data }
const displayDate = (value?: string | null) => value ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleString() : '—'
const formatNumber = (value?: number | null) => value == null ? '—' : value.toLocaleString()

export function DataQualityView({ symbol, instrumentName, exchange, currency }: { symbol: string; instrumentName: string; exchange?: string; currency?: string }) {
  const [interval, setInterval] = useState<MarketInterval>('1day')
  const [outputsize, setOutputsize] = useState('500')
  const [adjustment, setAdjustment] = useState<PriceAdjustment>('splits')
  const key = `/api/market?action=quality&symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&adjust=${adjustment}`
  const { data, error, isLoading, mutate, isValidating } = useSWR<QualityResponse>(key, fetcher, { revalidateOnFocus: false, dedupingInterval: 300_000 })
  const quality = data?.quality
  const warningCount = quality?.warnings.length ?? 0
  const sourceExchange = typeof data?.meta?.exchange === 'string' ? data.meta.exchange : exchange
  const sourceCurrency = typeof data?.meta?.currency === 'string' ? data.meta.currency : currency
  const statusText = quality?.status === 'available' ? 'Healthy' : quality?.status === 'warning' ? 'Review warnings' : quality?.status === 'unavailable' ? 'No observations' : error ? 'Provider unavailable' : 'Checking source'
  const statusTone = quality?.status === 'available' ? 'positive' : quality?.status === 'warning' || error ? 'warning' : ''

  return <div className="data-quality-view">
    <section className="panel quality-source-panel">
      <div className="quality-source-main"><span className="quality-source-icon"><Database size={17} /></span><div><span className="eyebrow">Live provider feed</span><h2>{instrumentName}</h2><p>{symbol} <span>·</span> {sourceExchange ?? 'Exchange metadata unavailable'} <span>·</span> {sourceCurrency ?? 'Currency not provided'}</p></div></div>
      <div className="quality-controls"><label>Frequency<select aria-label="Historical frequency" value={interval} onChange={event => setInterval(event.target.value as MarketInterval)}>{intervals.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Observations<select aria-label="Historical lookback observations" value={outputsize} onChange={event => setOutputsize(event.target.value)}>{['100', '250', '500', '1000', '2500', '5000'].map(value => <option key={value}>{value}</option>)}</select></label><label>Price basis<select aria-label="Price adjustment" value={adjustment} onChange={event => setAdjustment(event.target.value as PriceAdjustment)}><option value="splits">Split-adjusted</option><option value="all">Dividends and splits</option><option value="dividends">Dividend-adjusted</option><option value="none">Unadjusted</option></select></label><button type="button" className="button small" onClick={() => mutate()} disabled={isValidating} aria-label="Refresh quality data"><RefreshCw size={13} className={isValidating ? 'spin' : ''} />Refresh</button></div>
    </section>
    {(error || data?.error) && <div className="quality-error panel" role="alert"><AlertTriangle size={16} /><div><strong>Provider request failed</strong><p>{error?.message ?? data?.error}</p><small>Metrics are unavailable until the provider returns valid market history.</small></div></div>}
    <div className="metrics-grid quality-metrics">
      <article className="metric-card"><span>Availability</span><strong className={statusTone}>{statusText}</strong><small>{data?.source ?? 'Twelve Data'} · {interval}</small></article>
      <article className="metric-card"><span>Observations</span><strong>{isLoading ? 'Loading' : formatNumber(quality?.observations)}</strong><small>Requested history window</small></article>
      <article className="metric-card"><span>Missing observations</span><strong className={quality?.missingObservations ? 'warning' : ''}>{quality ? `${formatNumber(quality.missingObservations)}${quality.missingPercentage != null ? ` · ${quality.missingPercentage.toFixed(1)}%` : ''}` : '—'}</strong><small>Estimated expected sessions</small></article>
      <article className="metric-card"><span>Duplicate timestamps</span><strong className={quality?.duplicates ? 'warning' : ''}>{formatNumber(quality?.duplicates)}</strong><small>Detected in provider response</small></article>
      <article className="metric-card"><span>Data freshness</span><strong className={quality?.stale ? 'warning' : ''}>{quality?.stale == null ? '—' : quality.stale ? 'Stale' : 'Current'}</strong><small>Latest {displayDate(quality?.latestObservation)}</small></article>
      <article className="metric-card"><span>Historical coverage</span><strong>{quality?.coverageStart && quality.coverageEnd ? `${quality.coverageStart} — ${quality.coverageEnd}` : '—'}</strong><small>From provider observations</small></article>
    </div>
    <div className="quality-lower-grid">
      <section className="panel quality-validation-panel"><header className="quality-panel-heading"><div><span className="eyebrow">Integrity checks</span><h2>Validation summary</h2></div><span className={`quality-status-tag ${warningCount ? 'has-warnings' : quality?.status === 'available' ? 'is-healthy' : ''}`}>{error ? <XCircle size={13} /> : warningCount ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}{error ? 'Unavailable' : warningCount ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : quality?.status === 'available' ? 'Passed' : 'Awaiting data'}</span></header>
        {isLoading ? <p className="quality-empty">Loading provider-backed quality checks…</p> : error ? <p className="quality-empty">Validation cannot run without a successful provider response.</p> : <div className="quality-check-list"><QualityCheck label="OHLC relationships" value={quality?.invalidOhlc ?? 0} detail="Prices must satisfy low ≤ open/close ≤ high." /><QualityCheck label="Abnormal price movements" value={quality?.abnormalMoves ?? 0} detail="Daily close-to-close moves above 20% are flagged for review." /><QualityCheck label="Missing volume" value={quality?.missingVolume ?? 0} detail="Rows without provider-supplied volume." /><QualityCheck label="Missing timestamps" value={quality?.missingObservations ?? null} detail={interval === '1min' || interval === '5min' || interval === '15min' || interval === '30min' || interval === '45min' || interval === '1h' || interval === '2h' || interval === '4h' ? 'Intraday gap assessment needs the instrument exchange session calendar.' : 'Calendar estimate; not adjusted for exchange holidays.'} /><QualityCheck label="Duplicate timestamps" value={quality?.duplicates ?? 0} detail="Repeated observation keys in the selected response." /></div>}
        {quality?.warnings.length ? <ul className="quality-warning-list">{quality.warnings.map(warning => <li key={warning}><AlertTriangle size={13} />{warning}</li>)}</ul> : quality?.status === 'available' ? <p className="quality-success"><CheckCircle2 size={14} />No validation warnings in the returned observation set.</p> : null}
      </section>
      <section className="panel quality-sync-panel"><span className="eyebrow">Synchronization</span><h2>Provider status</h2><div className="quality-sync-item"><Clock3 size={15} /><div><strong>Last successful sync</strong><span>{displayDate(data?.lastSyncedAt)}</span></div></div><div className="quality-sync-item"><Database size={15} /><div><strong>Source and series</strong><span>{data?.source ?? 'Twelve Data'} · {symbol} · {interval}</span></div></div><div className="quality-sync-item"><ShieldCheck size={15} /><div><strong>Adjustment policy</strong><span>{adjustment} · provider-reported OHLCV</span></div></div><p className="method-note">Missing-session detection uses weekday estimates; exchange holidays and special sessions are not guessed. No price or return values are imputed.</p></section>
    </div>
    <section className="panel quality-history-panel"><header className="quality-panel-heading"><div><span className="eyebrow">Provider observations</span><h2>Recent OHLCV records</h2></div><span className="data-chip">{quality ? `${quality.observations.toLocaleString()} rows` : 'No source data'}</span></header>
      {isLoading ? <p className="quality-empty">Requesting historical records…</p> : !data?.values?.length ? <p className="quality-empty">No provider observations are available for this symbol and interval.</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">Recent source-backed historical prices</caption><thead><tr><th scope="col">Timestamp</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th><th scope="col">Volume</th></tr></thead><tbody>{[...data.values].reverse().slice(0, 12).map((bar, index) => <tr key={`${bar.datetime}-${index}`}><td><strong>{bar.datetime}</strong></td><td>{bar.open || '—'}</td><td>{bar.high || '—'}</td><td>{bar.low || '—'}</td><td>{bar.close || '—'}</td><td>{bar.volume ?? 'Not supplied'}</td></tr>)}</tbody></table></div>}
    </section>
  </div>
}

function QualityCheck({ label, value, detail }: { label: string; value: number | null; detail: string }) { return <div className="quality-check-row"><span className={`quality-check-icon ${value ? 'has-issues' : ''}`}>{value == null ? <Clock3 size={12} /> : value ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}</span><div><strong>{label}</strong><small>{detail}</small></div><b className={value ? 'warning' : ''}>{value == null ? 'Not assessed' : value.toLocaleString()}</b></div> }
