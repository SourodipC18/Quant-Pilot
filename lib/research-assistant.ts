import { generateText, Output } from 'ai'
import { z } from 'zod'
import { researchQuestions, type ResearchEvidence, type ResearchInterpretation, type ResearchQuestion } from './research-evidence'

const notes: Record<string, string> = {
  regime: 'The latest label summarizes conditions at that close; it is not a signal about the next session.',
  change: 'The trailing return describes the direction and size of the recent historical move.',
  volatility: 'Trailing volatility measures the size of past fluctuations, without saying which direction prices moved.',
  labeled: 'The classification applies only to endpoints with sufficient consecutive history.',
  fit: 'The fit measures how much in-sample variation the proxy model explains; it is not evidence of causation.',
  residual: 'Residual risk captures variation not explained by the selected ETF proxies.',
  market: 'The market coefficient measures association with the broad-market proxy, holding the other proxies fixed.',
  intercept: 'The intercept is conditional on these proxies and should not be treated as expected future outperformance.',
  model: 'The moving-average error measures typical absolute misses on the held-out outcomes.',
  baseline: 'The no-change baseline is the simplest comparison for judging whether the moving average added value on this sample.',
  comparison: 'The comparison applies only to this holdout and horizon; it does not establish persistent forecasting skill.',
  holdout: 'The number of non-overlapping outcomes limits how much confidence to put in the comparison.',
  uncertainty: 'Empirical error percentiles, when available, describe this holdout only and are not a prediction interval.',
  loss: 'This is the share of simulated paths finishing below their starting value, not an estimate of the true probability of future loss.',
  terminal: 'The median describes a central outcome under the selected historical resampling assumptions.',
  drawdown: 'Maximum drawdown measures peak-to-trough declines within paths, which ending returns alone can hide.',
  blocks: 'The eligible starts come from the aligned historical sample; the simulation cannot reproduce conditions absent from those returns.',
}

export function interpretationChoices(report: ResearchEvidence) {
  // Only controlled labels and computed values reach the model; provider text, tickers, and workspace data do not.
  return report.facts.flatMap(fact => Object.hasOwn(notes, fact.id) && !fact.value.startsWith('Unavailable')
    ? [{ fact, statement: notes[fact.id] }]
    : [])
}

export function citeInterpretation(report: ResearchEvidence, ids: string[]): ResearchInterpretation {
  const choices = interpretationChoices(report)
  return [...new Set(ids)].flatMap(id => {
    const choice = choices.find(item => item.fact.id === id)
    if (!choice) return []
    return [{ ...choice, provenance: `Twelve Data (${report.sources.map(source => source.symbol).join(', ')}) · ${choice.fact.date ?? `${report.from} to ${report.to}`} · QuantPilot run ${report.id}` }]
  })
}

export async function interpretResearch(report: ResearchEvidence, question: ResearchQuestion) {
  const choices = interpretationChoices(report)
  if (!choices.length) return []
  const ids = choices.map(choice => choice.fact.id) as [string, ...string[]]
  const { output } = await generateText({
    model: 'openai/gpt-4.1-mini',
    system: 'You prioritize findings for a historical research assistant. Select and order up to three supplied IDs that best answer the research question, without duplicates. Use only supplied candidates. Do not provide advice or invent findings. The output is a selection, not free text.',
    prompt: JSON.stringify({ question: researchQuestions[question], analysisType: report.method, candidates: choices.map(({ fact, statement }) => ({ id: fact.id, metric: fact.label, value: fact.value, interpretation: statement })) }),
    output: Output.object({ schema: z.object({ findings: z.array(z.enum(ids)).min(1).max(3) }) }),
    abortSignal: AbortSignal.timeout(20_000),
    maxRetries: 0,
  })
  return citeInterpretation(report, output.findings)
}
