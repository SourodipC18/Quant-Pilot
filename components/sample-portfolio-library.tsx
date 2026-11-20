'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, ChartPie, Download, FlaskConical, Layers, Plus, Trash2 } from 'lucide-react'
import { PROVIDER_LABELS, instrumentSymbol, priceLabel, providerForSymbol, symbolParts, type Instrument } from '@/lib/market-instruments'
import { allocationError, eligibleSampleInstrument, sampleAllocationCsv, SAMPLE_CAPITAL, SAMPLE_MAX_ASSETS, SAMPLE_PORTFOLIOS, type SampleHolding, type SamplePortfolio } from '@/lib/sample-portfolios'
import { Field, FieldLabel } from '@/components/ui/field'
import { SampleAllocationBar, SampleHistoryPreview } from '@/components/sample-portfolio-preview'
import { SamplePaperPanel } from '@/components/sample-paper-panel'
import { useSampleHistory } from '@/components/use-sample-history'

const marketName = (currency: string) => currency === 'USD' ? 'United States' : 'India'
export type SampleDestination = 'Portfolio Risk' | 'Optimization Lab' | 'Monte Carlo' | 'Correlation' | 'Stress lab' | 'Research Studio'
const destinations: SampleDestination[] = ['Portfolio Risk', 'Optimization Lab', 'Monte Carlo', 'Correlation', 'Stress lab', 'Research Studio']

export function SamplePortfolioLibrary({ draft, onDraft, workspaceReady, onSave, onAnalyze, onPaper }: {
  draft?: SamplePortfolio; onDraft: (value?: SamplePortfolio) => void; workspaceReady: boolean;
  onSave: (name: string, sample: SamplePortfolio) => Promise<void>; onAnalyze: (destination: SampleDestination, sample: SamplePortfolio) => void; onPaper: () => void;
}) {
  if (draft) return <SampleEditor key={draft.id} sample={draft} {...{ onDraft, workspaceReady, onSave, onAnalyze, onPaper }} />

  return <div className="sample-workspace">
    <section className="panel sample-library-intro" aria-labelledby="sample-library-title">
      <div><span className="eyebrow">Portfolio library / Phase 6B</span><h2 id="sample-library-title">Research-ready portfolios</h2><p>Start with a predefined allocation. Inspect the holdings and provider coverage, then run analytics without making a trade.</p></div>
      <div className="sample-library-stat"><Layers aria-hidden="true" /><strong>06</strong><span>Illustrative strategies</span></div>
    </section>
    <div className="sample-catalog" aria-label="Sample portfolio catalog">
      {SAMPLE_PORTFOLIOS.map((item, index) => <article className="panel sample-card" key={item.id}>
        <header><span className="eyebrow">{String(index + 1).padStart(2, '0')} / {item.theme}</span><span className="paper-tag">{item.currency}</span></header>
        <h3>{item.name}</h3><p>{item.description}</p>
        <SampleAllocationBar holdings={item.holdings} />
        <div className="sample-card-list">{item.holdings.map(holding => <span key={holding.symbol}>{symbolParts(holding.symbol).symbol} <strong>{holding.weightBps / 100}%</strong></span>)}</div>
        <footer><small>{marketName(item.currency)} · {PROVIDER_LABELS[providerForSymbol(item.holdings[0].symbol)]}</small><button className="button small" type="button" aria-label={`Preview ${item.name}`} onClick={() => onDraft(item)}>Preview <ArrowRight size={14} aria-hidden="true" /></button></footer>
      </article>)}
    </div>
    <p className="method-note">These portfolios illustrate research techniques. They are not investment recommendations. Historical availability is checked when you open a preview.</p>
  </div>
}

function SampleEditor({ sample, onDraft, workspaceReady, onSave, onAnalyze, onPaper }: {
  sample: SamplePortfolio; onDraft: (value?: SamplePortfolio) => void; workspaceReady: boolean;
  onSave: (name: string, sample: SamplePortfolio) => Promise<void>; onAnalyze: (destination: SampleDestination, sample: SamplePortfolio) => void; onPaper: () => void;
}) {
  const [name, setName] = useState(`${sample.name} copy`)
  const [destination, setDestination] = useState<SampleDestination>('Portfolio Risk')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null)
  const invalid = allocationError(sample.currency, sample.holdings)
  const history = useSampleHistory(sample)
  const branding = SAMPLE_PORTFOLIOS.find(item => item.id === sample.id)
  const changed = JSON.stringify(branding?.holdings) !== JSON.stringify(sample.holdings)
  const total = sample.holdings.reduce((sum, holding) => sum + holding.weightBps, 0)
  const changeHoldings = (holdings: SampleHolding[]) => { onDraft({ ...sample, holdings }); setFeedback(null) }
  const positionLabel = (symbol: string) => priceLabel(history.analytics?.positions.find(position => position.symbol === symbol)?.value, sample.currency, 2)

  function download() {
    const url = URL.createObjectURL(new Blob([sampleAllocationCsv(sample)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `quantpilot-${sample.id.replace('sample:', '')}.csv`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="sample-workspace">
    <div className="sample-back"><button type="button" className="text-button" onClick={() => onDraft(undefined)}><ArrowLeft size={15} aria-hidden="true" /> All samples</button><span className="paper-tag">Illustrative research example</span></div>
    <section className="panel sample-library-intro"><div><span className="eyebrow">{sample.theme} / {sample.currency}</span><h2>{sample.name}</h2><p>{sample.description}</p></div><div className="sample-library-stat"><ChartPie aria-hidden="true" /><strong>{sample.holdings.length.toString().padStart(2, '0')}</strong><span>{marketName(sample.currency)} · {sample.currency}</span></div></section>
    <SampleHistoryPreview sample={sample} history={history} valid={!invalid} />
    <section className="panel app-panel" aria-labelledby="sample-editor-heading">
      <header className="app-panel-header"><div><span className="eyebrow">03 / Holdings &amp; coverage</span><h2 id="sample-editor-heading">Customize allocation</h2></div><button type="button" className="button small" disabled={!changed || saving} onClick={() => { onDraft(branding); setFeedback(null) }}>Restore example</button></header>
      <p className="method-note">{marketName(sample.currency)} · {sample.currency} · {sample.currency === 'USD' ? 'Twelve Data' : 'Upstox'}{history.analytics ? ` · Position estimates as of ${history.analytics.valuationDate}` : ''}</p>
      <div className="table-scroll"><table className="data-table sample-holdings-table"><caption className="sr-only">Holdings, research allocations, and verified price coverage</caption><thead><tr><th scope="col">Instrument</th><th scope="col">Exchange</th><th scope="col">Weight (%)</th><th scope="col">Est. position</th><th scope="col">Daily history</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{sample.holdings.map(holding => {
        const coverage = history.data?.find(entry => entry.coverage.symbol === holding.symbol)?.coverage
        const ticker = symbolParts(holding.symbol).symbol
        return <tr key={holding.symbol}><th scope="row"><strong>{ticker}</strong><small>{holding.name} · {holding.kind}</small></th><td>{holding.exchange}</td><td><input aria-label={`${ticker} weight percent`} type="number" min="0.01" max="100" step="0.01" value={holding.weightBps ? holding.weightBps / 100 : ''} onChange={event => changeHoldings(sample.holdings.map(item => item.symbol === holding.symbol ? { ...item, weightBps: /^\d*(?:\.\d{0,2})?$/.test(event.target.value) ? Math.round(Number(event.target.value) * 100) : Number(event.target.value) * 100 } : item))} disabled={saving} /></td><td>{positionLabel(holding.symbol)}</td><td>{coverage?.count ? <><strong>{coverage.count} closes{coverage.stale ? ' · stale' : ''}</strong><small>{coverage.first} to {coverage.last}{coverage.unusual ? ' · unusual moves flagged' : ''}</small></> : <small>{coverage?.error ?? (history.isLoading ? 'Checking…' : 'Not available')}</small>}</td><td><button className="icon-button" type="button" disabled={saving} aria-label={`Remove ${ticker}`} onClick={() => changeHoldings(sample.holdings.filter(item => item.symbol !== holding.symbol))}><Trash2 size={15} aria-hidden="true" /></button></td></tr>
      })}</tbody></table></div>
      <div className="sample-editor-footer"><SampleInstrumentSearch key={sample.holdings.map(holding => holding.symbol).join('|')} sample={sample} busy={saving} onAdd={holding => changeHoldings([...sample.holdings, holding])} /><p className={invalid ? 'method-note warning' : 'method-note positive'} aria-live="polite">{(total / 100).toFixed(2)}% allocated{invalid ? ` · ${invalid}` : ''}</p></div>
      <div className="sample-workflow-actions">
        <form className="sample-inline-form" onSubmit={event => { event.preventDefault(); if (!invalid) onAnalyze(destination, sample) }}><Field className="analytics-field"><FieldLabel htmlFor="sample-destination">Analysis module</FieldLabel><select id="sample-destination" value={destination} onChange={event => setDestination(event.target.value as SampleDestination)}>{destinations.map(item => <option key={item} value={item}>{item === 'Optimization Lab' ? 'Optimization Lab / 3D Efficient Frontier' : item}</option>)}</select></Field><button className="button primary" type="submit" disabled={Boolean(invalid) || saving}><FlaskConical size={14} aria-hidden="true" /> Use in analytics</button></form>
        <button className="button small" type="button" disabled={Boolean(invalid)} onClick={download}><Download size={14} aria-hidden="true" /> Export CSV</button>
      </div>
      <form className="sample-inline-form sample-save" onSubmit={async event => {
        event.preventDefault()
        if (invalid || !history.analytics || saving || !name.trim()) return
        setSaving(true); setFeedback(null)
        try { await onSave(name.trim(), sample); setFeedback({ text: 'New research portfolio saved. Find it in Portfolio Risk.', error: false }) }
        catch (error) { setFeedback({ text: error instanceof Error ? error.message : 'Unable to save the portfolio.', error: true }) }
        finally { setSaving(false) }
      }}><Field className="analytics-field"><FieldLabel htmlFor="sample-save-name">New portfolio name</FieldLabel><input id="sample-save-name" value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></Field><button className="button" type="submit" disabled={!workspaceReady || Boolean(invalid) || !history.analytics || saving}>{saving ? 'Saving…' : 'Save as new portfolio'}</button></form>
      <p className="method-note">A saved copy uses illustrative share quantities at the latest shared verified close. Its weights can drift; saving does not place an order.</p>
      {feedback && <p className={`method-note ${feedback.error ? 'negative' : 'positive'}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    </section>
    <SamplePaperPanel key={`${sample.id}:${sample.holdings.map(holding => `${holding.symbol}:${holding.weightBps}`).join('|')}`} sample={sample} workspaceReady={workspaceReady} valid={!invalid} onPaper={onPaper} />
  </div>
}

function SampleInstrumentSearch({ sample, busy, onAdd }: { sample: SamplePortfolio; busy: boolean; onAdd: (holding: SampleHolding) => void }) {
  const [text, setText] = useState('')
  const [matches, setMatches] = useState<Instrument[]>([])
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  if (sample.holdings.length >= SAMPLE_MAX_ASSETS) return <p className="method-note">Eight instruments maximum.</p>
  return <div className="sample-search"><form className="sample-inline-form" onSubmit={async event => {
    event.preventDefault()
    if (searching || text.trim().length < 2) return
    setSearching(true); setMatches([]); setError('')
    try {
      const response = await fetch(`/api/market?action=search&q=${encodeURIComponent(text.trim())}`, { signal: AbortSignal.timeout(12_000) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Search could not be completed.')
      const seen = new Set(sample.holdings.map(item => symbolParts(item.symbol).symbol))
      const eligible = (result.data as Instrument[]).filter(item => {
        const ticker = symbolParts(instrumentSymbol(item)).symbol
        if (!eligibleSampleInstrument(item, sample.currency) || seen.has(ticker)) return false
        seen.add(ticker)
        return true
      }).slice(0, 6)
      setMatches(eligible)
      if (!eligible.length) setError(result.warnings?.[0] ?? `No new ${sample.currency} listings found. Search by ticker or company name.`)
    } catch (error) { setError(error instanceof Error ? error.message : 'Search failed.') }
    finally { setSearching(false) }
  }}><Field className="analytics-field"><FieldLabel htmlFor="sample-instrument">Add an instrument</FieldLabel><input id="sample-instrument" value={text} onChange={event => { setText(event.target.value); setMatches([]); setError('') }} placeholder="Ticker or company" minLength={2} maxLength={80} required disabled={busy} /></Field><button type="submit" className="button small" disabled={searching || busy}><Plus size={14} aria-hidden="true" /> {searching ? 'Searching…' : 'Find'}</button></form>
    {error && <p className="method-note" role="status">{error}</p>}
    {matches.length > 0 && <ul className="sample-search-results" aria-label="Eligible market listings">{matches.map(item => <li key={instrumentSymbol(item)}><button type="button" className="button small" disabled={busy} onClick={() => onAdd({ symbol: instrumentSymbol(item), name: item.instrument_name, exchange: item.exchange ?? symbolParts(instrumentSymbol(item)).exchange ?? '', kind: item.instrument_type ?? 'Listed instrument', weightBps: 0 })}><Plus size={13} aria-hidden="true" /> {item.instrument_name} ({item.symbol}) · {item.exchange}</button></li>)}</ul>}
  </div>
}
