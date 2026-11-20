'use client'

import { useState, type FormEvent } from 'react'
import { Activity, BarChart3, FileText, LoaderCircle, TrendingUp, Waves } from 'lucide-react'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { methodInfo, researchMethods, type ResearchMethod, type ResearchRun } from '@/lib/research-evidence'
import type { ResearchInput } from '@/lib/research-run'
import { ResearchPanel, ResearchResults } from '@/components/research-results'
import { ResearchActions, requestResearch } from '@/components/research-actions'

const icons = { regimes: Activity, factors: BarChart3, forecast: TrendingUp, scenarios: Waves }

export function ResearchStudio({ initialSymbol, initialMethod, workspaceLoading, providerConfigured }: { initialSymbol: string; initialMethod: ResearchMethod; workspaceLoading: boolean; providerConfigured?: boolean }) {
  const [method, setMethod] = useState(initialMethod)
  const [ticker, setTicker] = useState(initialSymbol)
  const [basket, setBasket] = useState(initialSymbol)
  const [factorSymbols, setFactorSymbols] = useState(initialSymbol)
  const [block, setBlock] = useState('1')
  const [run, setRun] = useState<ResearchRun | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const fields = new FormData(event.currentTarget)
    const common = { lookback: Number(fields.get('lookback')) }
    const input: ResearchInput = method === 'scenarios'
      ? { method, ...common, symbols: basket.split(',').map(symbol => symbol.trim()).filter(Boolean), horizon: Number(fields.get('scenario-horizon')), paths: Number(fields.get('paths')), seed: Number(fields.get('seed')), block: block === '1' ? 1 : Number(fields.get('block-length')) }
      : method === 'factors' ? { method, ...common, symbols: factorSymbols.split(',').map(symbol => symbol.trim()).filter(Boolean) }
        : method === 'forecast' ? { method, ...common, symbol: ticker, horizon: Number(fields.get('forecast-horizon')) } : { method, ...common, symbol: ticker }
    setPending(true); setError(''); setRun(null)
    try {
      const response = await requestResearch({ action: 'run', input })
      setRun(await response.json() as ResearchRun)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Research could not be run.') }
    finally { setPending(false) }
  }

  return <div className="research-studio">
    <section className="panel research-methods" aria-labelledby="research-method-heading">
      <header><span className="eyebrow">Methods library</span><h2 id="research-method-heading">Choose an analysis</h2></header>
      <div className="research-method-grid">{researchMethods.map(key => {
        const Icon = icons[key]
        return <button key={key} type="button" className="research-method" aria-pressed={method === key} disabled={pending} onClick={() => { if (method !== key) { setMethod(key); setError(''); setRun(null) } }}><Icon aria-hidden="true"/><span><strong>{methodInfo[key].title}</strong><small>{methodInfo[key].blurb}</small></span></button>
      })}</div>
    </section>
    <ResearchPanel eyebrow="Run controls" title={methodInfo[method].title}>
      <form className="research-run-form" onSubmit={submit}>
        <FieldGroup className="research-control-grid">
          {method === 'scenarios' ? <Field className="analytics-field"><FieldLabel htmlFor="research-basket">Portfolio symbols</FieldLabel><input id="research-basket" required value={basket} maxLength={333} onChange={event => setBasket(event.target.value)} placeholder="AAPL, MSFT" autoComplete="off" aria-describedby="research-basket-help"/><FieldDescription id="research-basket-help">One to five comma-separated symbols. Multiple assets use equal weights.</FieldDescription></Field>
          : method === 'factors' ? <Field className="analytics-field"><FieldLabel htmlFor="factor-symbols">Target symbols</FieldLabel><input id="factor-symbols" required value={factorSymbols} maxLength={199} onChange={event => setFactorSymbols(event.target.value)} autoComplete="off" aria-describedby="factor-symbols-help"/><FieldDescription id="factor-symbols-help">Enter one symbol or up to three comma-separated symbols for an equal-weight portfolio.</FieldDescription></Field>
            : <Field className="analytics-field"><FieldLabel htmlFor="research-symbol">Instrument symbol</FieldLabel><input id="research-symbol" required value={ticker} maxLength={65} onChange={event => setTicker(event.target.value)} autoComplete="off" /></Field>}
          <Field className="analytics-field"><FieldLabel htmlFor="research-lookback">Historical lookback</FieldLabel><select id="research-lookback" name="lookback" defaultValue="504"><option value="252">Up to 252 daily returns</option><option value="504">Up to 504 daily returns</option><option value="756">Up to 756 daily returns</option></select></Field>
          {method === 'forecast' && <Field className="analytics-field"><FieldLabel htmlFor="forecast-horizon">Forecast horizon</FieldLabel><select id="forecast-horizon" name="forecast-horizon" defaultValue="5">{[1, 5, 10, 20].map(days => <option key={days} value={days}>{days} trading {days === 1 ? 'observation' : 'observations'}</option>)}</select></Field>}
          {method === 'scenarios' && <>
            <Field className="analytics-field"><FieldLabel htmlFor="scenario-mode">Bootstrap method</FieldLabel><select id="scenario-mode" value={block} onChange={event => setBlock(event.target.value)}><option value="1">Independent daily draws</option><option value="moving">Moving blocks</option></select></Field>
            {block === 'moving' && <Field className="analytics-field"><FieldLabel htmlFor="block-length">Block length</FieldLabel><input id="block-length" name="block-length" type="number" min="2" max="20" defaultValue="5" required /></Field>}
            <Field className="analytics-field"><FieldLabel htmlFor="scenario-horizon">Trading observations per path</FieldLabel><input id="scenario-horizon" name="scenario-horizon" type="number" min="5" max="252" defaultValue="126" required /></Field>
            <Field className="analytics-field"><FieldLabel htmlFor="scenario-paths">Simulation paths</FieldLabel><input id="scenario-paths" name="paths" type="number" min="100" max="4000" defaultValue="1000" required /></Field>
            <Field className="analytics-field"><FieldLabel htmlFor="scenario-seed">Random seed</FieldLabel><input id="scenario-seed" name="seed" type="number" min="0" max="4294967295" defaultValue="42" required /></Field>
          </>}
        </FieldGroup>
        <div className="research-form-actions"><button type="submit" className="button primary" disabled={pending || workspaceLoading || providerConfigured === false}>{pending ? <LoaderCircle size={15} className="spin" aria-hidden="true"/> : <Activity size={15} aria-hidden="true"/>}{pending ? 'Running analysis…' : 'Run analysis'}</button><span className="research-subtext" role="status">{pending ? 'Loading daily history and calculating results.' : workspaceLoading ? 'Opening your workspace…' : run ? 'Analysis complete. Evidence is shown below.' : 'Daily closes · use :NSE or :BSE for Indian listings'}</span></div>
      </form>
      {error && <p role="alert" className="research-error">{error}</p>}
    </ResearchPanel>
    {run ? <><ResearchResults report={run.report}/><ResearchActions key={run.report.id} run={run}/></> : !pending && !error && <section className="panel research-empty"><FileText size={18} aria-hidden="true"/><div><h2>No analysis yet</h2><p>Run a method to open its evidence, export a PDF, or ask for a source-cited interpretation.</p></div></section>}
  </div>
}
