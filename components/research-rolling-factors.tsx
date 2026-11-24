'use client'

import { useId, useMemo, useState } from 'react'
import { historicalValues } from '@/lib/advanced-risk'
import { SYMBOL_PATTERN } from '@/lib/market-instruments'
import { RISK_PERIODS, type RiskSeries } from '@/lib/portfolio-risk-lab'
import { useRiskHistory } from './use-risk-history'
import { StudioFactorSurface } from './advanced-risk-view'
import { RiskPanel } from './risk-chart'
import { Field, FieldGroup, FieldLabel } from './ui/field'

export function ResearchRollingFactors({ targets, dark }: { targets: string; dark: boolean }) {
  const id = useId()
  const [requested, setRequested] = useState('')
  const [period, setPeriod] = useState<keyof typeof RISK_PERIODS>('3Y')
  const normalized = targets.split(',').map(symbol => symbol.trim().toUpperCase()).filter(Boolean)
  const valid = normalized.length >= 1 && normalized.length <= 3 && new Set(normalized).size === normalized.length && normalized.every(symbol => SYMBOL_PATTERN.test(symbol))
  const key = normalized.join(',')
  const submitted = valid && key === requested
  const symbols = useMemo(() => submitted ? requested.split(',') : [], [requested, submitted])
  const history = useRiskHistory(symbols, null)
  const currency = history.data?.currency ?? undefined
  const assets = useMemo((): RiskSeries[] => currency ? symbols.flatMap(symbol => history.data?.entries.filter(entry => entry.symbol === symbol) ?? []) : [], [currency, symbols, history.data])
  const days = RISK_PERIODS[period]
  const values = useMemo(() => historicalValues(assets, days, { kind: 'targets', weights: assets.map(() => 1 / assets.length), capital: 1 }), [assets, days])
  return <RiskPanel index="Research Studio · rolling model" title="Rolling factor exposure" subtitle="Track how sensitivities changed through time. This is separate from the full-period joint regression above and uses the same target symbols at equal weights, with no idle cash.">
    <FieldGroup className="risk-fields risk-instrument-form"><Field className="analytics-field"><FieldLabel htmlFor={id}>Factor history range</FieldLabel><select id={id} value={period} onChange={event => setPeriod(event.target.value as typeof period)}><option value="6M">6 months</option><option value="1Y">1 year</option><option value="3Y">3 years</option></select></Field><button className="button small risk-reload" type="button" disabled={!valid || history.isLoading} onClick={() => { if (submitted) void history.mutate(); else setRequested(key) }}>{submitted ? 'Refresh target history' : 'Load rolling exposures'}</button></FieldGroup>
    {!valid && <p className="method-note">Enter one to three distinct, valid listing symbols in Target symbols above.</p>}
    {history.isLoading && <p className="method-note" role="status">Loading verified target history…</p>}
    {Boolean(history.data?.errors.length) && <div className="risk-empty" role="status"><strong>Target history is incomplete</strong><ul>{history.data?.errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
    {submitted && currency && <><p className="method-note">{symbols.join(', ')} · {currency} · {history.data?.sources} · {values.length} valid target returns{values.length ? `, ${values[0].from} to ${values.at(-1)!.date}` : ''}. {currency === 'INR' ? 'Upstox closes are as reported.' : 'Twelve Data closes are split adjusted.'}</p><StudioFactorSurface rows={values} assets={assets} currency={currency} days={days} dark={dark} /></>}
  </RiskPanel>
}
