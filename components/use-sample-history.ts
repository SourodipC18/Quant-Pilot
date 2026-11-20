'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { readSampleHistory, sampleAnalytics, unavailableSampleHistory, type SampleHistory } from '@/lib/sample-analytics'
import { sampleAdjustment, SAMPLE_CAPITAL, SAMPLE_HISTORY_SIZE, type SampleCurrency, type SamplePortfolio } from '@/lib/sample-portfolios'

type HistoryKey = readonly ['sample-history', SampleCurrency, ...string[]]

async function fetchHistories([, currency, ...symbols]: HistoryKey) {
  return Promise.all(symbols.map(async symbol => {
    const query = new URLSearchParams({ action: 'history', interval: '1day', symbol, outputsize: String(SAMPLE_HISTORY_SIZE), adjust: sampleAdjustment(symbol) })
    try {
      const response = await fetch(`/api/market?${query}`, { signal: AbortSignal.timeout(15_000) })
      const history = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(history?.values)) throw new Error(history?.error ?? 'Daily history is unavailable.')
      return readSampleHistory(symbol, currency, history as SampleHistory)
    } catch (error) {
      return unavailableSampleHistory(symbol, error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The price-history request timed out.')
    }
  }))
}

export function useSampleHistory(sample?: SamplePortfolio) {
  const key: HistoryKey | null = sample?.holdings.length ? ['sample-history', sample.currency, ...sample.holdings.map(asset => asset.symbol).sort()] : null
  const { data, isLoading, mutate } = useSWR(key, fetchHistories, { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 300_000 })
  const analytics = useMemo(() => sample && data ? sampleAnalytics(sample.holdings, sample.currency, data, SAMPLE_CAPITAL[sample.currency]) : null, [data, sample])
  return { data, analytics, isLoading, retry: mutate }
}
