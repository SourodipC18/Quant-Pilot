import { alignDailyReturns } from './research-methods'

export function simulationPortfolio(
  assets: {
    symbol: string
    shares: number
    points: { date: string; close: number }[]
  }[],
  cash = 0,
) {
  if (
    !assets.length ||
    assets.length > 10 ||
    assets.some((a) => !(a.shares > 0 && Number.isFinite(a.shares))) ||
    !(cash >= 0 && Number.isFinite(cash))
  )
    return null
  const rows = alignDailyReturns(assets.map((a) => a.points)).rows.filter(
    (r) => Date.parse(r.date) - Date.parse(r.from) <= 7 * 86400000,
  )
  const last = rows.at(-1)?.date
  if (!last) return null
  const marks = assets.map(
    (a) => a.shares * a.points.find((p) => p.date === last)!.close,
  )
  const total = marks.reduce((a, b) => a + b, cash)
  if (!(total > 0 && Number.isFinite(total))) return null
  const weights = marks.map((v) => v / total)
  // For fixed weights, projecting each matched vector before sampling is exactly equivalent to sampling it first.
  return {
    weights,
    total,
    cashWeight: cash / total,
    start: rows[0].from,
    end: last,
    returns: rows.map((r) =>
      r.values.reduce((v, x, i) => v + x * weights[i], 0),
    ),
  }
}
