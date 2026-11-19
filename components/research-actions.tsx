'use client'

import { useState } from 'react'
import { Download, LoaderCircle, Sparkles } from 'lucide-react'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { ResearchPanel } from '@/components/research-results'
import { researchQuestions, type ResearchInterpretation, type ResearchQuestion, type ResearchRun } from '@/lib/research-evidence'

export async function requestResearch(body: unknown) {
  const response = await fetch('/api/research', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
  }).catch(() => { throw new Error('The request did not finish. Check your connection and try again.') })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error ?? 'Research request failed. Try again.')
  }
  return response
}

export function ResearchActions({ run }: { run: ResearchRun }) {
  const [question, setQuestion] = useState<ResearchQuestion>('takeaway')
  const [answer, setAnswer] = useState<ResearchInterpretation | null>(null)
  const [pending, setPending] = useState<'export' | 'interpret' | null>(null)
  const [error, setError] = useState<{ action: 'export' | 'interpret'; message: string } | null>(null)
  const [status, setStatus] = useState('')

  async function act(action: 'export' | 'interpret') {
    setPending(action); setError(null); setStatus('')
    if (action === 'interpret') setAnswer(null)
    try {
      const response = await requestResearch({ action, token: run.token, ...(action === 'interpret' ? { question } : {}) })
      if (action === 'interpret') setAnswer((await response.json()).answer as ResearchInterpretation)
      else {
        const url = URL.createObjectURL(await response.blob()), link = document.createElement('a')
        link.href = url; link.download = `quantpilot-${run.report.method}-${run.report.createdAt.slice(0, 10)}.pdf`
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
        setStatus('PDF downloaded.')
      }
    } catch (failure) { setError({ action, message: failure instanceof Error ? failure.message : 'The snapshot could not be processed.' }) }
    finally { setPending(null) }
  }

  return <>
    <ResearchPanel eyebrow="Research reports" title="Export this evidence">
      <p className="research-subtext">Download the exact snapshot above, with its charts, source dates, assumptions, and limitations.</p>
      <div className="research-form-actions"><button type="button" className="button" disabled={pending !== null} onClick={() => act('export')}>{pending === 'export' ? <LoaderCircle size={15} className="spin" aria-hidden="true"/> : <Download size={15} aria-hidden="true"/>}{pending === 'export' ? 'Preparing PDF…' : 'Download PDF'}</button><span className="research-subtext" role="status">{status}</span></div>
      {error?.action === 'export' && <p role="alert" className="research-error">{error.message}</p>}
    </ResearchPanel>
    <ResearchPanel eyebrow="AI research assistant" title="Interpret this analysis">
      <p className="research-subtext">The assistant sees only the selected run&apos;s calculated evidence, not your saved workspace. It selects relevant findings and cites the paired metric. No personalized investment advice.</p>
      <FieldGroup className="research-control-grid"><Field className="analytics-field"><FieldLabel htmlFor="research-question">Research question</FieldLabel><select id="research-question" value={question} disabled={pending !== null} onChange={event => { setQuestion(event.target.value as ResearchQuestion); setAnswer(null); setError(null) }}>{Object.entries(researchQuestions).map(([id, question]) => <option key={id} value={id}>{question}</option>)}</select></Field></FieldGroup>
      <div><button type="button" className="button" disabled={pending !== null} onClick={() => act('interpret')}>{pending === 'interpret' ? <LoaderCircle size={15} className="spin" aria-hidden="true"/> : <Sparkles size={15} aria-hidden="true"/>}{pending === 'interpret' ? 'Reviewing evidence…' : 'Interpret evidence'}</button></div>
      <div aria-live="polite">{answer && <ol className="research-answer">{answer.map(item => <li key={item.fact.id}>{item.statement}<small><strong>{item.fact.label}: {item.fact.value}</strong> · {item.fact.kind}<br/>{item.provenance}</small></li>)}</ol>}</div>
      {error?.action === 'interpret' && <p role="alert" className="research-error">{error.message}</p>}
    </ResearchPanel>
  </>
}
