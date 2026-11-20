import { PROVIDER_LABELS, type ProviderId } from './market-instruments'

export const researchSourceLabel = (provider?: ProviderId) => PROVIDER_LABELS[provider ?? 'twelvedata']
export const researchMethods = ['regimes', 'factors', 'forecast', 'scenarios'] as const
export type ResearchMethod = typeof researchMethods[number]
export const methodInfo = {
  regimes: { title: 'Market Regimes', blurb: 'Describe the market using trailing returns and volatility.' },
  factors: { title: 'Factor Models', blurb: 'Measure return exposure to documented ETF proxies.' },
  forecast: { title: 'Forecasting', blurb: 'Compare a moving-average model against no change.' },
  scenarios: { title: 'Monte Carlo', blurb: 'Resample historical returns for one asset or a portfolio.' },
} satisfies Record<ResearchMethod, { title: string; blurb: string }>

export const researchQuestions = {
  takeaway: 'What stands out in this run?',
  risk: 'What does this run say about risk?',
  limits: 'What should I be careful not to infer?',
} as const
export type ResearchQuestion = keyof typeof researchQuestions
export type EvidenceFact = { id: string; label: string; value: string; kind: 'Calculated metric' | 'Model output' | 'Provider fact'; date?: string }
export type EvidenceChart = { title: string; unit: 'percent'; series: [string, string?]; points: { label: string; primary: number; secondary?: number }[] }
export type EvidenceTable = { caption: string; headers: string[]; rows: string[][] }
export type ResearchEvidence = {
  id: string; method: ResearchMethod; title: string; createdAt: string; from: string; to: string; sample: number;
  sources: { symbol: string; currency: string; provider?: ProviderId; syncedAt: string; first: string; last: string }[];
  facts: EvidenceFact[]; assumptions: string[]; limitations: string[]; warnings: string[]; charts: EvidenceChart[];
  tables: EvidenceTable[];
  references?: { label: string; url: string }[];
}
export type ResearchRun = { report: ResearchEvidence; token: string }
export type ResearchInterpretation = { statement: string; fact: EvidenceFact; provenance: string }[]
export const displayPercent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`
