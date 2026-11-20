import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { researchSourceLabel, type EvidenceChart, type ResearchEvidence } from './research-evidence'

const pageWidth = 595, pageHeight = 842, margin = 42, contentWidth = pageWidth - margin * 2
const ink = rgb(0.1, 0.16, 0.14), muted = rgb(0.30, 0.36, 0.34), rule = rgb(0.84, 0.88, 0.86)
const colors = [rgb(0.20, 0.43, 0.28), rgb(0.17, 0.35, 0.55)]
const printable = (value: string) => value.replace(/[–—−]/g, '-').replace(/[^\x20-\x7E\u00B7]/g, ' ')

export async function renderResearchPdf(report: ResearchEvidence) {
  const doc = await PDFDocument.create(), normal = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
  doc.setTitle(`${report.title} | QuantPilot`)
  doc.setSubject(`QuantPilot research analysis ${report.id}`)
  doc.setCreator('QuantPilot')
  function addPage() {
    const page = doc.addPage([pageWidth, pageHeight])
    page.drawText('QUANTPILOT  /  RESEARCH EVIDENCE', { x: margin, y: 805, size: 9, font: bold, color: colors[0] })
    page.drawLine({ start: { x: margin, y: 792 }, end: { x: pageWidth - margin, y: 792 }, color: rule })
    return page
  }
  let page = addPage(), y = 765
  const reserve = (height: number) => { if (y - height < 55) { page = addPage(); y = 765 } }
  function wrap(value: string, width: number, size: number, strong = false) {
    const font = strong ? bold : normal
    const lines: string[] = []
    let current = ''
    for (const token of printable(value).split(/\s+/)) {
      const candidate = current ? `${current} ${token}` : token
      if (font.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue }
      if (current) lines.push(current)
      current = ''
      for (const char of token) {
        if (font.widthOfTextAtSize(current + char, size) > width) { lines.push(current); current = '' }
        current += char
      }
    }
    if (current) lines.push(current)
    return lines
  }
  function block(value: string, { size = 10, strong = false, space = 6 } = {}) {
    const lines = wrap(value, contentWidth, size, strong)
    reserve(lines.length * (size + 4) + space)
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size, font: strong ? bold : normal, color: strong ? ink : muted })
      y -= size + 4
    }
    y -= space
  }
  function heading(title: string, keepWithNext = 38) { reserve(keepWithNext + 24); block(title, { size: 12, strong: true }) }
  function table(headers: string[], rows: string[][]) {
    const size = 9, widths = headers.length === 3 ? [contentWidth * 0.50, contentWidth * 0.24, contentWidth * 0.26] : [contentWidth * 0.52, contentWidth * 0.48]
    function drawRow(values: string[], header = false) {
      const cells = values.map((value, i) => wrap(value, widths[i] - 14, size, header))
      const height = Math.max(...cells.map(lines => lines.length)) * 12 + 10
      if (!header && y - height < 55) { reserve(height); drawRow(headers, true) }
      if (header) page.drawRectangle({ x: margin, y: y - height + 8, width: contentWidth, height, color: rgb(0.94, 0.96, 0.95) })
      cells.forEach((lines, i) => {
        const x = margin + 7 + widths.slice(0, i).reduce((sum, width) => sum + width, 0)
        lines.forEach((line, lineIndex) => page.drawText(line, { x, y: y - 5 - lineIndex * 12, size, font: header ? bold : normal, color: ink }))
      })
      page.drawLine({ start: { x: margin, y: y - height + 8 }, end: { x: pageWidth - margin, y: y - height + 8 }, color: rule, thickness: 0.5 })
      y -= height
    }
    drawRow(headers, true)
    for (const row of rows) drawRow(row)
    y -= 18
  }
  function chart(data: EvidenceChart) {
    if (!data.points.length) return
    heading(data.title, 165)
    const height = 105, width = contentWidth - 55, left = margin + 42, bottom = y - height - 7
    const values = data.points.flatMap(point => [point.primary, ...(point.secondary === undefined ? [] : [point.secondary])])
    const min = Math.min(0, ...values), max = Math.max(0.001, ...values), span = max - min
    const x = (index: number) => left + width * index / Math.max(1, data.points.length - 1)
    const level = (value: number) => bottom + height * (value - min) / span
    for (let i = 0; i <= 4; i++) {
      const value = min + span * i / 4, axisY = level(value)
      page.drawLine({ start: { x: left, y: axisY }, end: { x: left + width, y: axisY }, color: rule, thickness: 0.6 })
      const label = `${Number(value.toPrecision(3))}%`
      page.drawText(label, { x: left - normal.widthOfTextAtSize(label, 8) - 5, y: axisY - 3, size: 8, font: normal, color: muted })
    }
    const ticks = [...new Set([0, Math.floor((data.points.length - 1) / 2), data.points.length - 1])]
    for (const index of ticks) {
      const label = data.points[index].label, textWidth = normal.widthOfTextAtSize(label, 8)
      page.drawText(label, { x: Math.min(left + width - textWidth, Math.max(left, x(index) - textWidth / 2)), y: bottom - 14, size: 8, font: normal, color: muted })
    }
    const keys = ['primary', 'secondary'] as const
    keys.forEach((key, series) => {
      if (!data.series[series]) return
      for (let i = 1; i < data.points.length; i++) {
        const previous = data.points[i - 1][key], current = data.points[i][key]
        if (previous === undefined || current === undefined) continue
        page.drawLine({ start: { x: x(i - 1), y: level(previous) }, end: { x: x(i), y: level(current) }, color: colors[series], thickness: 1.4, ...(series ? { dashArray: [4, 2] } : {}) })
      }
      const legendX = left + series * 150
      page.drawLine({ start: { x: legendX, y: bottom - 26 }, end: { x: legendX + 14, y: bottom - 26 }, color: colors[series], thickness: 1.4, ...(series ? { dashArray: [4, 2] } : {}) })
      page.drawText(printable(data.series[series]), { x: legendX + 20, y: bottom - 29, size: 8, font: normal, color: ink })
    })
    y = bottom - 48
  }
  block(report.title, { size: 23, strong: true, space: 10 })
  block(`Analysis ID: ${report.id}  |  Generated: ${report.createdAt}`)
  block(`Evidence window: ${report.from} to ${report.to}  |  ${report.sample} valid daily returns`, { space: 14 })
  heading('Evidence')
  table(['Metric', 'Value', 'Evidence type / date'], report.facts.map(fact => [fact.label, fact.value, fact.date ? `${fact.kind} / ${fact.date}` : fact.kind]))
  for (const detail of report.tables) { heading(detail.caption); table(detail.headers, detail.rows) }
  report.charts.forEach(chart)
  heading('Source provenance')
  for (const source of report.sources) block(`${source.symbol} (${source.currency}) | ${researchSourceLabel(source.provider)} | ${source.first} to ${source.last} | retrieved ${source.syncedAt}`)
  for (const reference of report.references ?? []) block(`ETF issuer: ${reference.label} | ${reference.url}`)
  heading('Assumptions and methodology')
  report.assumptions.forEach(note => block(note))
  heading('Limitations')
  report.limitations.forEach(note => block(note))
  if (report.warnings.length) { heading('Data quality notes'); report.warnings.forEach(note => block(note)) }
  const pages = doc.getPages()
  pages.forEach((item, index) => {
    item.drawText('Historical research only. Not investment advice.', { x: margin, y: 33, size: 8, font: normal, color: muted })
    item.drawText(`${index + 1} / ${pages.length}`, { x: pageWidth - margin - 26, y: 33, size: 8, font: normal, color: muted })
  })
  return doc.save()
}
