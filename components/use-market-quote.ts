import useSWR from 'swr'

const quoteRefreshInterval = 60_000
export const marketRetryOptions = { shouldRetryOnError: true, errorRetryInterval: 30_000 }

export function useMarketQuote<T>(key: string | null, fetcher: (url: string) => Promise<T>) {
  return useSWR(key, async (url: string) => ({ quote: await fetcher(url), checkedAt: Date.now() }), {
    ...marketRetryOptions,
    refreshInterval: quoteRefreshInterval,
    dedupingInterval: 15_000,
    revalidateOnFocus: true,
  })
}

export function marketCheckTime(checkedAt: number) {
  return new Date(checkedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}
