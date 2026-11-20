'use client'

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { researchSourceLabel, type EvidenceChart, type ResearchEvidence } from '@/lib/research-evidence'

export function ResearchPanel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="panel app-panel research-panel"><header className="app-panel-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div></header>{children}</section>
}

function ResearchChart({ chart }: { chart: EvidenceChart }) {
  const distribution = chart.points[0]?.label.endsWith('th')
  const config = { primary: { label: chart.series[0], color: 'var(--chart-1)' }, secondary: { label: chart.series[1], color: 'var(--chart-2)' } }
  return <figure className="research-chart"><figcaption>{chart.title}</figcaption><ChartContainer config={config} className="h-[224px] w-full min-w-0 aspect-auto"><LineChart accessibilityLayer data={chart.points} margin={{ left: 0, right: 13, top: 12 }}>
    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
    <XAxis dataKey="label" minTickGap={30} tickLine={false} tickMargin={7} tickFormatter={value => distribution ? value : value.slice(5)} />
    <YAxis width={48} tickLine={false} tickFormatter={value => `${Number(value.toPrecision(3))}%`} />
    <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="4 3" />
    <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <span>{name === 'primary' ? chart.series[0] : chart.series[1]}: {Number(value).toFixed(2)}%</span>} />} />
    <Line type="linear" dataKey="primary" name="primary" stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
    {chart.series[1] && <Line type="linear" dataKey="secondary" name="secondary" stroke="var(--color-secondary)" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
  </LineChart></ChartContainer><div className="research-legend"><span>{chart.series[0]}</span>{chart.series[1] && <span>{chart.series[1]}</span>}{distribution && <span className="research-axis-label">Scenario percentile</span>}</div></figure>
}

export function ResearchResults({ report }: { report: ResearchEvidence }) {
  return <>
    <ResearchPanel eyebrow="Evidence snapshot" title={report.title}>
      <div><p className="research-subtext">{report.from} to {report.to} · {report.sample} matched daily returns</p><p className="research-subtext">Run <span title={report.id}>{report.id.slice(0, 8)}</span> · Generated <time dateTime={report.createdAt}>{report.createdAt}</time></p></div>
      <div className="research-metrics">{report.facts.filter(fact => fact.id !== 'frequency' && fact.id !== 'sample').map(fact => <article key={fact.id} className="metric-card"><span>{fact.label}</span><strong>{fact.value}</strong><small>{fact.kind}{fact.date ? ` · ${fact.date}` : ''}</small></article>)}</div>
      {report.charts.map(chart => <ResearchChart key={chart.title} chart={chart} />)}
      {report.tables.map(table => <div key={table.caption} className="research-table-wrap"><table className="research-table"><caption>{table.caption}</caption><thead><tr>{table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{table.rows.map(([label, ...values]) => <tr key={label}><th scope="row">{label}</th>{values.map((value, i) => <td key={i}>{value}</td>)}</tr>)}</tbody></table></div>)}
    </ResearchPanel>
    <ResearchPanel eyebrow="Data & methodology" title="Sources and assumptions">
      <ul className="research-notes">{report.sources.map(item => <li key={item.symbol}><strong>{item.symbol} · {item.currency}</strong> — {researchSourceLabel(item.provider)}, {item.first} to {item.last}. Retrieved <time dateTime={item.syncedAt}>{item.syncedAt}</time>.</li>)}</ul>
      {report.references && <p className="research-subtext">ETF issuer references: {report.references.map(({ label, url }, index) => <span key={url}>{index > 0 && ' · '}<a className="underline underline-offset-2" href={url} target="_blank" rel="noreferrer">{label}<span className="sr-only"> (opens in a new tab)</span></a></span>)}</p>}
      <ul className="research-notes">{[...report.assumptions, ...report.limitations].map(note => <li key={note}>{note}</li>)}</ul>
      {report.warnings.length > 0 && <details className="research-warnings"><summary>Data quality notes ({report.warnings.length})</summary><ul className="research-notes">{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    </ResearchPanel>
  </>
}
