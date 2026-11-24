import type { SampleCurrency } from './sample-portfolios'

export type RiskProxy = { symbol: string; name: string; url: string }
const nse = (symbol: string, name: string): RiskProxy => ({ symbol: `${symbol}:NSE`, name, url: `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}` })

export const RESEARCH_PROXIES: Record<SampleCurrency, readonly RiskProxy[]> = {
  USD: [
    { symbol: 'SPY', name: 'State Street / SPY', url: 'https://www.ssga.com/us/en/intermediary/etfs/spdr-sp-500-etf-trust-spy' },
    { symbol: 'IWM', name: 'iShares / IWM', url: 'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf' },
    { symbol: 'QQQ', name: 'Invesco / QQQ', url: 'https://www.invesco.com/qqq-etf/en/home.html' },
  ],
  INR: [nse('NIFTYBEES', 'Nippon India / NIFTYBEES'), nse('JUNIORBEES', 'Nippon India / JUNIORBEES'), nse('BANKBEES', 'Nippon India / BANKBEES')],
}

export const ROLLING_PROXIES: Record<SampleCurrency, readonly RiskProxy[]> = {
  USD: [
    { ...RESEARCH_PROXIES.USD[0], name: 'US market' },
    { symbol: 'XLK', name: 'US technology', url: 'https://www.ssga.com/us/en/intermediary/etfs/state-street-technology-select-sector-spdr-etf-xlk' },
    { ...RESEARCH_PROXIES.USD[1], name: 'US small cap' },
    { symbol: 'XLF', name: 'US financials', url: 'https://www.ssga.com/us/en/intermediary/etfs/state-street-financial-select-sector-spdr-etf-xlf' },
    { ...RESEARCH_PROXIES.USD[2], name: 'Nasdaq-100' },
  ],
  INR: [
    { ...RESEARCH_PROXIES.INR[0], name: 'India market' },
    nse('ITBEES', 'India technology'),
    nse('HDFCSML250', 'India small cap'),
    { ...RESEARCH_PROXIES.INR[2], name: 'India banks' },
    { ...RESEARCH_PROXIES.INR[1], name: 'Nifty Next 50' },
  ],
}

export const RISK_BENCHMARKS: Record<SampleCurrency, string> = { USD: 'SPY', INR: 'NIFTY:NSE' }
