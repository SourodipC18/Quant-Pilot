'use client'

import { useCallback, useMemo } from 'react'
import { alignedProxy, rollingFactors, type ValueInterval } from '@/lib/advanced-risk'
import { SYMBOL_PATTERN } from '@/lib/market-instruments'
import type { RiskSeries } from '@/lib/portfolio-risk-lab'
import { ROLLING_PROXIES, type RiskProxy } from '@/lib/risk-proxies'
import type { SampleCurrency } from '@/lib/sample-portfolios'
import { useRiskHistory } from './use-risk-history'

const NO_PROXIES: readonly RiskProxy[] = []

export function useRiskComparisons({ rows, assets, currency, benchmark, days, window }: { rows: ValueInterval[]; assets: RiskSeries[]; currency?: SampleCurrency; benchmark?: string; days: number; window: number }) {
  const definitions = currency ? ROLLING_PROXIES[currency] : NO_PROXIES
  const broadSymbol = definitions[0]?.symbol
  const primarySymbols = useMemo(() => rows.length >= 20 ? [...new Set([...(benchmark && SYMBOL_PATTERN.test(benchmark) ? [benchmark] : []), ...(rows.length >= 60 && broadSymbol ? [broadSymbol] : [])])].filter(symbol => !assets.some(asset => asset.symbol === symbol)) : [], [rows.length, benchmark, broadSymbol, assets])
  const primary = useRiskHistory(primarySymbols, currency ?? null)
  const broad = assets.find(asset => asset.symbol === broadSymbol) ?? primary.data?.entries.find(entry => entry.symbol === broadSymbol && !entry.error && entry.currency === currency)
  const secondarySymbols = useMemo(() => broad && rows.length >= 60 ? definitions.slice(1).map(factor => factor.symbol).filter(symbol => !primarySymbols.includes(symbol) && !assets.some(asset => asset.symbol === symbol)) : [], [broad, rows.length, definitions, primarySymbols, assets])
  const secondary = useRiskHistory(secondarySymbols, currency ?? null)
  const loading = primary.isLoading || secondary.isLoading
  const refreshPrimary = primary.mutate, refreshSecondary = secondary.mutate
  const primaryFailed = Boolean(primary.data?.errors.length), secondaryFailed = Boolean(secondary.data?.errors.length)
  const refresh = useCallback(() => Promise.all([primaryFailed ? refreshPrimary() : null, secondaryFailed ? refreshSecondary() : null]), [primaryFailed, secondaryFailed, refreshPrimary, refreshSecondary])
  return useMemo(() => {
    const entries = [...(primary.data?.entries ?? []), ...(secondary.data?.entries ?? [])]
    const source = (symbol?: string) => assets.find(asset => asset.symbol === symbol) ?? entries.find(entry => entry.symbol === symbol && !entry.error && entry.currency === currency)
    const reference = source(benchmark)
    const benchmarkReturns = alignedProxy(rows, reference, days)
    const latest = rows.at(-1)?.date
    const benchmarkMatches = rows.filter((_, index) => benchmarkReturns[index] != null)
    const predictors = definitions.map((factor, index) => index === 0 || broad ? alignedProxy(rows, source(factor.symbol), days, index === 0 ? undefined : broad) : rows.map(() => null))
    const grid = rollingFactors(rows, predictors, window)
    return {
      benchmarkReturns, benchmarkMatches, latest, definitions, grid,
      loading, refresh, hasRequestErrors: primaryFailed || secondaryFailed,
      status: definitions.map((factor, index) => {
        const current = source(factor.symbol)
        const entry = entries.find(item => item.symbol === factor.symbol)
        const fit = grid.at(-1)?.[index]
        const latestFit = grid.findLastIndex(row => row[index] != null)
        const warning = entry && !entry.error ? [entry.stale && 'stale history', entry.unusual && 'unusual price moves'].filter(Boolean).join(', ') : ''
        const reason = fit ? null : latestFit >= 0 ? `Last usable estimate: ${rows[latestFit].date}. No estimate at the latest portfolio close.`
          : current && (index === 0 || broad) ? `Requires ${window} contiguous aligned returns and nonzero variation.`
            : loading ? 'Loading verified history…' : rows.length < window ? `Requires at least ${window} aligned returns.`
              : index > 0 && !broad ? 'Broad-market proxy is unavailable for the return spread.' : entry?.error ?? 'Verified proxy history is unavailable.'
        return { ...factor, fit, reason, warning }
      }),
      benchmarkError: benchmark && !reference ? entries.find(entry => entry.symbol === benchmark)?.error ?? null : null,
    }
  }, [assets, primary.data, secondary.data, primaryFailed, secondaryFailed, loading, refresh, broad, currency, days, benchmark, definitions, rows, window])
}

export type RiskComparisons = ReturnType<typeof useRiskComparisons>
