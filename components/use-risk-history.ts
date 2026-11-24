'use client'

import useSWR from 'swr'
import { readSampleHistory, type SampleHistory } from '@/lib/sample-analytics'
import { sampleAdjustment, type SampleCurrency } from '@/lib/sample-portfolios'
import { providerForSymbol, PROVIDER_LABELS } from '@/lib/market-instruments'

type Bounds = { start: string; end: string }
type HistoryKey = readonly ['portfolio-risk-history', SampleCurrency | null, string, string, ...string[]]

async function getRiskHistory([, expectedCurrency, start, end, ...symbols]: HistoryKey) {
  const entries = await Promise.all(symbols.map(async symbol => {
    const source = PROVIDER_LABELS[providerForSymbol(symbol)]
    const query = new URLSearchParams({ action: 'history', symbol, interval: '1day', adjust: sampleAdjustment(symbol), outputsize: '800' })
    if (start && end) {
      query.set('start_date', start)
      // Twelve Data can interpret date-only end bounds at midnight; replay filters back to the requested date.
      const last = providerForSymbol(symbol) === 'twelvedata' ? new Date(Date.parse(end) + 86_400_000).toISOString().slice(0, 10) : end
      query.set('end_date', last)
    }
    try {
      const response = await fetch(`/api/market?${query}`, { signal: AbortSignal.timeout(20_000) })
      const history = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(history?.values)) throw new Error(typeof history?.error === 'string' ? history.error : 'Daily closes unavailable.')
      const currency = history.meta?.currency
      if ((currency !== 'USD' && currency !== 'INR') || (expectedCurrency && expectedCurrency !== currency)) throw new Error('Quote currency does not match the selected portfolio; no FX conversion is used.')
      const entry = readSampleHistory(symbol, currency, history as SampleHistory, new Date(), true)
      if (!entry.points.length) throw new Error(entry.coverage.error)
      return { symbol, source, currency: currency as SampleCurrency, stale: Boolean(entry.coverage.stale), unusual: Boolean(entry.coverage.unusual), points: entry.points.map(({ datetime, close }) => ({ date: datetime, close })), error: null }
    } catch (error) {
      return { symbol, source, currency: null, stale: false, unusual: false, points: [], error: error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The price-history request timed out.' }
    }
  }))
  const currency = entries[0]?.currency ?? null
  const errors = entries.flatMap(({ symbol, source, error }) => error ? [`${symbol} · ${source}: ${error}`] : [])
  if (new Set(entries.flatMap(entry => entry.currency ? [entry.currency] : [])).size > 1) errors.push('Holdings have different verified quote currencies. No FX conversion or partial aggregation is applied.')
  return { entries, currency: errors.length ? null : currency, errors, sources: [...new Set(entries.map(entry => entry.source))].join(' / ') }
}

export function useRiskHistory(symbols: string[], currency: SampleCurrency | null, bounds?: Bounds) {
  const key: HistoryKey | null = symbols.length && symbols.length <= 10 ? ['portfolio-risk-history', currency, bounds?.start ?? '', bounds?.end ?? '', ...new Set(symbols.slice().sort())] : null
  return useSWR(key, getRiskHistory, { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 300_000 })
}
