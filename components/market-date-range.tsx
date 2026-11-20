'use client'

import { useId, useState } from 'react'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'

export type MarketDates = { start: string; end: string }
export const emptyMarketDates: MarketDates = { start: '', end: '' }

export function withMarketDates(url: string, dates: MarketDates) {
  return `${url}${dates.start ? `&start_date=${dates.start}` : ''}${dates.end ? `&end_date=${dates.end}` : ''}`
}

export function MarketDateRange({ dates, onApply }: { dates: MarketDates; onApply: (dates: MarketDates) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(dates)
  const invalid = Boolean(draft.start && draft.end && draft.start > draft.end)
  return <form className="market-date-range" onSubmit={event => { event.preventDefault(); if (!invalid) onApply(draft) }} aria-label="Historical date range">
    <FieldGroup className="quality-controls w-auto flex-row flex-wrap items-end gap-2">
      <Field className="w-auto" data-invalid={invalid || undefined}><FieldLabel htmlFor={`${id}-start`}>From date</FieldLabel><input id={`${id}-start`} type="date" value={draft.start} aria-invalid={invalid || undefined} onChange={event => setDraft({ ...draft, start: event.target.value })} /></Field>
      <Field className="w-auto" data-invalid={invalid || undefined}><FieldLabel htmlFor={`${id}-end`}>To date</FieldLabel><input id={`${id}-end`} type="date" value={draft.end} aria-invalid={invalid || undefined} onChange={event => setDraft({ ...draft, end: event.target.value })} /></Field>
      <button type="submit" className="button small" disabled={invalid}>Apply dates</button>
      {(draft.start || draft.end || dates.start || dates.end) && <button type="button" className="button small" onClick={() => { setDraft(emptyMarketDates); onApply(emptyMarketDates) }}>Clear dates</button>}
    </FieldGroup>
    {invalid && <p className="method-note negative" role="alert">The start date must be on or before the end date.</p>}
  </form>
}
