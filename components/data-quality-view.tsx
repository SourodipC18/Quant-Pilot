'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { emptyMarketDates, MarketDateRange, withMarketDates } from '@/components/market-date-range'
import type { MarketBar, MarketInterval, MarketQuality, PriceAdjustment } from '@/lib/market-data'
import { priceLabel, PROVIDER_LABELS, providerForSymbol, verifiedCurrency, type ProviderConnection, type ProviderId } from '@/lib/market-instruments'

type QualityResponse = { values?: MarketBar[]; meta?: Record<string, unknown>; source?: ProviderId; lastSyncedAt?: string; interval?: MarketInterval; adjustment?: PriceAdjustment; quality?: MarketQuality; error?: string }
type StatusResponse = { providers: ProviderConnection[] }
const intervals: MarketInterval[] = ['1min', '5min', '15min', '30min', '45min', '1h', '2h', '4h', '1day', '1week', '1month']
const fetcher = async <T,>(url: string): Promise<T> => {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new Error('The market-data request timed out. Please try again.')
    if (error instanceof TypeError) throw new Error('The market-data service could not be reached. Check your connection and try again.')
    throw error
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data && typeof data.error === 'string' ? data.error : `Unable to retrieve market history (${response.status}).`)
  if (data == null) throw new Error('The market-data service returned an unreadable response. Please try again.')
  return data as T
}
const displayDate = (value?: string | null) => !value ? '—' : value.length === 10 ? value : new Date(value).toLocaleString()
const formatNumber = (value?: number | null) => value == null ? '—' : value.toLocaleString()

export function DataQualityView({ symbol, instrumentName, exchange, currency }: { symbol: string; instrumentName: string; exchange?: string; currency?: string }) {
  const [interval, setInterval] = useState<MarketInterval>('1day')
  const [outputsize, setOutputsize] = useState('500')
  const expectedProvider = providerForSymbol(symbol)
  const indian = expectedProvider === 'upstox'
  const [adjustment, setAdjustment] = useState<PriceAdjustment>(indian ? 'none' : 'splits')
  const [dates, setDates] = useState(emptyMarketDates)
  const key = withMarketDates(`/api/market?action=quality&symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&adjust=${adjustment}`, dates)
  const { data, error, isLoading, mutate, isValidating } = useSWR<QualityResponse>(key, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false })
  const { data: status, error: statusError, mutate: refreshStatus } = useSWR<StatusResponse>('/api/market?action=status&probe=1', fetcher, { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 60_000 })
  const activeProvider = PROVIDER_LABELS[data?.source ?? expectedProvider]
  const quality = data?.quality
  const warningCount = quality?.warnings.length ?? 0
  const sourceExchange = typeof data?.meta?.exchange === 'string' ? data.meta.exchange : exchange
  const sourceCurrency = typeof data?.meta?.currency === 'string' ? data.meta.currency : currency
  const statusText = quality?.status === 'available' ? 'Healthy' : quality?.status === 'warning' ? 'Review warnings' : quality?.status === 'unavailable' ? 'No observations' : error ? 'Provider unavailable' : 'Checking source'
  const statusTone = quality?.status === 'available' ? 'positive' : quality?.status === 'warning' || error ? 'warning' : ''

  return <div className="data-quality-view">
    <section className="panel quality-source-panel">
      <div className="quality-source-main"><span className="quality-source-icon"><Database size={17} /></span><div><span className="eyebrow">Historical provider feed</span><h2>{instrumentName}</h2><p>{symbol} <span>·</span> {sourceExchange ?? 'Exchange metadata unavailable'} <span>·</span> {sourceCurrency ?? 'Currency not provided'}</p></div></div>
      <div className="quality-controls"><label>Frequency<select aria-label="Historical frequency" value={interval} onChange={event => setInterval(event.target.value as MarketInterval)}>{intervals.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Observations<select aria-label="Historical lookback observations" value={outputsize} onChange={event => setOutputsize(event.target.value)}>{['100', '250', '500', '1000', '2500', '5000'].map(value => <option key={value}>{value}</option>)}</select></label><label>Price basis<select aria-label="Price adjustment" value={adjustment} onChange={event => setAdjustment(event.target.value as PriceAdjustment)} disabled={indian}>{!indian && <><option value="splits">Split-adjusted</option><option value="all">Dividends and splits</option><option value="dividends">Dividend-adjusted</option></>}<option value="none">{indian ? 'As reported' : 'Unadjusted'}</option></select></label><button type="button" className="button small" onClick={() => { void mutate(); void refreshStatus() }} disabled={isValidating} aria-label="Refresh quality data"><RefreshCw size={13} className={isValidating ? 'spin' : ''} />Refresh</button></div>
    </section>
    <div className="panel app-panel"><MarketDateRange dates={dates} onApply={setDates} /></div>
    {(error || data?.error) && <div className="quality-error panel" role="alert"><AlertTriangle size={16} /><div><strong>Provider request failed</strong><p>{error?.message ?? data?.error}</p><small>Metrics are unavailable until the provider returns valid market history.</small></div></div>}
    <div className="metrics-grid quality-metrics">
      <article className="metric-card"><span>Availability</span><strong className={statusTone}>{statusText}</strong><small>{activeProvider} · {interval}</small></article>
      <article className="metric-card"><span>Observations</span><strong>{isLoading ? 'Loading' : formatNumber(quality?.observations)}</strong><small>Requested history window</small></article>
      <article className="metric-card"><span>Missing observations</span><strong className={quality?.missingObservations ? 'warning' : ''}>{quality ? `${formatNumber(quality.missingObservations)}${quality.missingPercentage != null ? ` · ${quality.missingPercentage.toFixed(1)}%` : ''}` : '—'}</strong><small>Estimated expected sessions</small></article>
      <article className="metric-card"><span>Duplicate timestamps</span><strong className={quality?.duplicates ? 'warning' : ''}>{formatNumber(quality?.duplicates)}</strong><small>Detected in provider response</small></article>
      <article className="metric-card"><span>Data freshness</span><strong className={quality?.stale ? 'warning' : ''}>{quality?.stale == null ? '—' : quality.stale ? 'Stale' : dates.end ? 'Fresh for range' : 'Current'}</strong><small>Latest {displayDate(quality?.latestObservation)}</small></article>
      <article className="metric-card"><span>Historical coverage</span><strong>{quality?.coverageStart && quality.coverageEnd ? `${quality.coverageStart} — ${quality.coverageEnd}` : '—'}</strong><small>From provider observations</small></article>
    </div>
    <div className="quality-lower-grid">
      <section className="panel quality-validation-panel"><header className="quality-panel-heading"><div><span className="eyebrow">Integrity checks</span><h2>Validation summary</h2></div><span className={`quality-status-tag ${warningCount ? 'has-warnings' : quality?.status === 'available' ? 'is-healthy' : ''}`}>{error ? <XCircle size={13} /> : warningCount ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}{error ? 'Unavailable' : warningCount ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : quality?.status === 'available' ? 'Passed' : 'Awaiting data'}</span></header>
        {isLoading ? <p className="quality-empty">Loading provider-backed quality checks…</p> : error ? <p className="quality-empty">Validation cannot run without a successful provider response.</p> : <div className="quality-check-list"><QualityCheck label="OHLC relationships" value={quality?.invalidOhlc ?? 0} detail="Prices must satisfy low ≤ open/close ≤ high." /><QualityCheck label="Abnormal price movements" value={quality?.abnormalMoves ?? 0} detail="Daily close-to-close moves above 20% are flagged for review." /><QualityCheck label="Missing volume" value={quality?.missingVolume ?? 0} detail="Rows without provider-supplied volume." /><QualityCheck label="Missing timestamps" value={quality?.missingObservations ?? null} detail={interval === '1min' || interval === '5min' || interval === '15min' || interval === '30min' || interval === '45min' || interval === '1h' || interval === '2h' || interval === '4h' ? 'Intraday gap assessment needs the instrument exchange session calendar.' : 'Calendar estimate; not adjusted for exchange holidays.'} /><QualityCheck label="Duplicate timestamps" value={quality?.duplicates ?? 0} detail="Repeated observation keys in the selected response." /></div>}
        {quality?.warnings.length ? <ul className="quality-warning-list">{quality.warnings.map(warning => <li key={warning}><AlertTriangle size={13} />{warning}</li>)}</ul> : quality?.status === 'available' ? <p className="quality-success"><CheckCircle2 size={14} />No validation warnings in the returned observation set.</p> : null}
      </section>
      <section className="panel quality-sync-panel"><span className="eyebrow">Synchronization</span><h2>Provider status</h2>{statusError ? <p className="method-note" role="status">{statusError.message}</p> : <ProviderChecks providers={status?.providers} />}<div className="quality-sync-item"><Clock3 size={15} /><div><strong>Last successful sync</strong><span>{displayDate(data?.lastSyncedAt)}</span></div></div><div className="quality-sync-item"><Database size={15} /><div><strong>Source and series</strong><span>{activeProvider} · {symbol} · {interval}</span></div></div><div className="quality-sync-item"><ShieldCheck size={15} /><div><strong>Adjustment policy</strong><span>{indian ? 'As reported · corporate actions can affect returns' : `${data?.adjustment ?? adjustment} · provider-reported OHLCV`}</span></div></div><p className="method-note">Missing-session detection uses weekday estimates; exchange holidays and special sessions are not guessed. No price or return values are imputed.</p></section>
    </div>
    <section className="panel quality-history-panel"><header className="quality-panel-heading"><div><span className="eyebrow">Provider observations</span><h2>Recent OHLCV records</h2></div><span className="data-chip">{quality ? `${quality.observations.toLocaleString()} rows` : 'No source data'}</span></header>
      {isLoading ? <p className="quality-empty">Requesting historical records…</p> : !data?.values?.length ? <p className="quality-empty">No provider observations are available for this symbol and interval.</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">Recent source-backed historical prices</caption><thead><tr><th scope="col">Timestamp</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th><th scope="col">Volume</th></tr></thead><tbody>{[...data.values].reverse().slice(0, 12).map((bar, index) => <tr key={`${bar.datetime}-${index}`}><td><strong>{bar.datetime}</strong></td><td>{observedPrice(bar.open, sourceCurrency)}</td><td>{observedPrice(bar.high, sourceCurrency)}</td><td>{observedPrice(bar.low, sourceCurrency)}</td><td>{observedPrice(bar.close, sourceCurrency)}</td><td>{bar.volume ?? 'Not supplied'}</td></tr>)}</tbody></table></div>}
    </section>
  </div>
}

function ProviderChecks({ providers }: { providers?: ProviderConnection[] }) {
  if (!providers) return <p className="method-note" role="status">Checking provider connections…</p>
  const labels = { configured: 'Configured', connected: 'Connected', not_configured: 'Not configured', error: 'Request failed', rate_limited: 'Rate limited' }
  return <>{providers.map(provider => <div className="quality-sync-item" key={provider.id}>
    {provider.status === 'connected' ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
    <div><strong>{PROVIDER_LABELS[provider.id]} · {labels[provider.status]}</strong>{provider.checkedAt && <span>Last checked: {displayDate(provider.checkedAt)}</span>}{provider.message && <span>{provider.message}</span>}</div>
  </div>)}</>
}

function observedPrice(value: string, currency?: string) {
  return value.trim() && Number(value) > 0 ? priceLabel(Number(value), verifiedCurrency(currency), 4) : '—'
}

function QualityCheck({ label, value, detail }: { label: string; value: number | null; detail: string }) { return <div className="quality-check-row"><span className={`quality-check-icon ${value ? 'has-issues' : ''}`}>{value == null ? <Clock3 size={12} /> : value ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}</span><div><strong>{label}</strong><small>{detail}</small></div><b className={value ? 'warning' : ''}>{value == null ? 'Not assessed' : value.toLocaleString()}</b></div> }
