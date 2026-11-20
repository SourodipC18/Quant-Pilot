'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, Box, Database, Play, Wallet } from 'lucide-react'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { OptimizationResults } from '@/components/optimization-results'
import { PROVIDER_LABELS, verifiedCurrency, type ProviderId } from '@/lib/market-instruments'
import { calculateOptimizationLab, LAB_WINDOWS, labConstraintError, MAX_LAB_ASSETS, type LabAsset, type LabWindow } from '@/lib/optimization-lab'

type Portfolio = { id: string; name: string }
type Holding = { symbol: string; shares: string }
type History = { values: { datetime: string; close: string }[]; meta?: { currency?: unknown }; source: ProviderId; lastSyncedAt?: string }
type HistoryKey = readonly ['optimization-history', ...string[]]
type Setup = { symbols: string[]; window: LabWindow; cap: number }
const windowLabels: Record<LabWindow, string> = { '6M': 'Last 6 months', '1Y': 'Last 1 year', '2Y': 'Last 2 years' }

async function loadHistories([, ...symbols]: HistoryKey) {
  return Promise.all(symbols.map(async symbol => {
    const query = new URLSearchParams({ action: 'history', symbol, interval: '1day', outputsize: '750' })
    try {
      const response = await fetch(`/api/market?${query}`, { signal: AbortSignal.timeout(15_000) })
      const history = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(history?.values)) throw new Error(history?.error ?? 'Price history could not be loaded.')
      return { symbol, history: history as History }
    } catch (error) {
      const message = error instanceof Error && error.name === 'TimeoutError' ? 'The provider request timed out.' : error instanceof Error ? error.message : 'Price history could not be loaded.'
      throw new Error(`${symbol}: ${message}`)
    }
  }))
}

export function OptimizationLab({ portfolios, portfolio, holdings, workspaceError, paperMode, paperLoading, providerConfigured, dark, onPortfolioChange, onOpenPortfolio }: {
  portfolios?: Portfolio[]; portfolio?: Portfolio; holdings: Holding[]; workspaceError?: string; paperMode?: boolean; paperLoading?: boolean; providerConfigured?: boolean; dark: boolean
  onPortfolioChange: (id: string) => void; onOpenPortfolio: () => void
}) {
  return <section className="optimization-lab" aria-label="Portfolio optimization workspace">
    {workspaceError ? <section className="panel app-panel optimization-state" aria-labelledby="optimization-workspace-error">
      <Wallet aria-hidden="true" />
      <h2 id="optimization-workspace-error">Saved holdings unavailable</h2>
      <p role="alert">{workspaceError}</p>
      {workspaceError.includes('Sign in') && <Link className="button small" href="/sign-in">Sign in <ArrowRight size={14} /></Link>}
    </section> : !portfolios ? <section className="panel app-panel optimization-state" role="status">Loading your saved portfolios…</section> : !portfolio ? <section className="panel app-panel optimization-state" aria-labelledby="optimization-empty-title">
      <Wallet aria-hidden="true" />
      <h2 id="optimization-empty-title">Start with a saved portfolio</h2>
      <p>Add at least two holdings to a portfolio in Portfolio Risk. The lab uses their real daily closing prices; it does not generate example results.</p>
      <button type="button" className="button small" onClick={onOpenPortfolio}>Open Portfolio Risk <ArrowRight size={14} /></button>
    </section> : <OptimizationSetup key={`${portfolio.id}:${Boolean(paperLoading)}`} {...{ portfolios, portfolio, holdings, paperMode, paperLoading, providerConfigured, dark, onPortfolioChange, onOpenPortfolio }} />}
  </section>
}

function OptimizationSetup({ portfolios, portfolio, holdings, paperMode, paperLoading, providerConfigured, dark, onPortfolioChange, onOpenPortfolio }: {
  portfolios: Portfolio[]; portfolio: Portfolio; holdings: Holding[]; paperMode?: boolean; paperLoading?: boolean; providerConfigured?: boolean; dark: boolean
  onPortfolioChange: (id: string) => void; onOpenPortfolio: () => void
}) {
  const eligible = useMemo(() => {
    const shares = new Map<string, number>()
    for (const holding of holdings) {
      const quantity = Number(holding.shares)
      if (Number.isFinite(quantity) && quantity > 0) shares.set(holding.symbol, (shares.get(holding.symbol) ?? 0) + quantity)
    }
    return shares
  }, [holdings])
  const allSymbols = [...eligible.keys()].sort()
  const [selected, setSelected] = useState(() => allSymbols.slice(0, MAX_LAB_ASSETS))
  const [window, setWindow] = useState<LabWindow>('1Y')
  const [cap, setCap] = useState('80')
  const [run, setRun] = useState<Setup | null>(null)
  const symbols = selected.filter(symbol => eligible.has(symbol)).sort()
  const constraintError = labConstraintError(symbols.length, Number(cap))
  const validRun = run !== null && run.symbols.every(symbol => eligible.has(symbol))
  const historyKey: HistoryKey | null = validRun && providerConfigured !== false ? ['optimization-history', ...run.symbols] : null
  const { data: histories, error, isLoading, mutate } = useSWR(historyKey, loadHistories, { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 300_000 })
  const calculation = useMemo(() => {
    if (!run || !histories) return null
    const assets: LabAsset[] = histories.map(({ symbol, history }) => ({
      symbol, currency: verifiedCurrency(history.meta?.currency),
      points: history.values.map(({ datetime, close }) => ({ datetime, close: Number(close) })),
    }))
    const currentShares = eligible.size === run.symbols.length ? run.symbols.map(symbol => eligible.get(symbol)!) : undefined
    return calculateOptimizationLab(assets, run.window, run.cap, currentShares)
  }, [run, histories, eligible])
  const pending = run && (run.cap !== Number(cap) || run.window !== window || run.symbols.join('|') !== symbols.join('|'))
  const sources = [...new Set(histories?.map(({ history }) => PROVIDER_LABELS[history.source]).filter(Boolean))].join(', ')
  const fetchTimes = histories?.map(({ history }) => history.lastSyncedAt).filter((date): date is string => typeof date === 'string').sort() ?? []
  const oldestFetch = fetchTimes.length === histories?.length ? fetchTimes[0] : undefined

  return <>
    <section className="panel app-panel" aria-labelledby="optimization-setup-title">
      <header className="app-panel-header optimization-header"><div><span className="eyebrow">01 / Research setup</span><h2 id="optimization-setup-title">Portfolio & constraints</h2></div><button type="button" className="text-button" onClick={onOpenPortfolio}>{paperMode ? 'Trade positions' : 'Manage holdings'} <ArrowRight size={14} /></button></header>
      <form className="optimization-form" onSubmit={event => {
        event.preventDefault()
        if (constraintError || providerConfigured === false) return
        if (error && run?.symbols.join('|') === symbols.join('|')) void mutate()
        setRun({ symbols, window, cap: Number(cap) })
      }}>
        <FieldGroup className="optimization-fields">
          <Field><FieldLabel htmlFor="optimization-portfolio">Portfolio source</FieldLabel><select id="optimization-portfolio" value={portfolio.id} onChange={event => onPortfolioChange(event.target.value)}>{portfolios.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field><FieldLabel htmlFor="optimization-window">Calculation period</FieldLabel><select id="optimization-window" value={window} onChange={event => setWindow(event.target.value as LabWindow)}>{(Object.keys(LAB_WINDOWS) as LabWindow[]).map(value => <option key={value} value={value}>{windowLabels[value]}</option>)}</select></Field>
          <Field data-invalid={constraintError && symbols.length >= 2 ? true : undefined}><FieldLabel htmlFor="optimization-cap">Max asset weight (%)</FieldLabel><input id="optimization-cap" type="number" min="1" max="100" step="1" required value={cap} onChange={event => setCap(event.target.value)} aria-invalid={Boolean(constraintError && symbols.length >= 2)} aria-describedby="optimization-constraints" /></Field>
        </FieldGroup>
        <FieldSet aria-describedby="optimization-constraints" className="optimization-assets">
          <FieldLegend variant="label">Included holdings <span>{symbols.length}/{MAX_LAB_ASSETS}</span></FieldLegend>
          <div className="optimization-asset-options">
            {allSymbols.length ? allSymbols.map(symbol => <label key={symbol} className="optimization-asset">
              <input type="checkbox" checked={symbols.includes(symbol)} disabled={!symbols.includes(symbol) && symbols.length >= MAX_LAB_ASSETS} onChange={event => setSelected(previous => event.target.checked ? [...previous, symbol] : previous.filter(value => value !== symbol))} />
              <span>{symbol}</span>
            </label>) : <p>{paperLoading ? 'Loading simulated positions…' : paperMode ? 'No simulated holdings are available.' : 'No holdings are saved in this portfolio.'}</p>}
          </div>
        </FieldSet>
        <div className="optimization-form-footer">
          <p id="optimization-constraints">Long-only · Fully invested · No leverage. Idle cash is excluded from all weights.<br />{paperLoading ? 'Waiting for simulated positions.' : allSymbols.length < 2 ? paperMode ? 'Hold at least two instruments in Paper Trading.' : 'Add at least two holdings in Portfolio Risk.' : constraintError ?? 'Pick up to eight holdings in the same quote currency.'}</p>
          <button type="submit" className="button primary" disabled={Boolean(constraintError) || isLoading || providerConfigured === false}><Play size={14} aria-hidden="true" /> {isLoading ? 'Loading history…' : 'Run optimization'}</button>
        </div>
      </form>
      {providerConfigured === false && <p className="optimization-feedback" role="status"><Database size={16} aria-hidden="true" /> Market history is unavailable until a market-data provider is configured.</p>}
      {pending && !isLoading && <p className="optimization-feedback" role="status">Inputs changed. Run optimization to apply the new settings.</p>}
    </section>
    {isLoading ? <section className="panel app-panel optimization-state" role="status"><Database aria-hidden="true" /><h2>Loading aligned price history</h2><p>Requesting daily closes for the selected holdings.</p></section>
      : error || (calculation && 'error' in calculation) ? <section className="panel app-panel optimization-state" role="alert"><Database aria-hidden="true" /><h2>Optimization unavailable</h2><p>{error?.message ?? (calculation && 'error' in calculation ? calculation.error : '')}</p></section>
      : validRun && calculation && 'result' in calculation ? <OptimizationResults key={JSON.stringify(run)} result={calculation.result} cap={run.cap} window={windowLabels[run.window]} {...{ dark, sources, oldestFetch }} />
      : <section className="panel app-panel optimization-state" aria-labelledby="optimization-ready-title"><Box aria-hidden="true" /><h2 id="optimization-ready-title">3D Efficient Frontier</h2><p>Run the lab to compare feasible allocations by annualized volatility, expected return, and Sharpe ratio. Every plotted allocation is also available in a keyboard-accessible results table.</p></section>}
  </>
}
