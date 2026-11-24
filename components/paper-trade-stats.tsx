'use client'
import {Bar,BarChart,Line,LineChart,XAxis,YAxis} from 'recharts'
import {ChartContainer} from './ui/chart'
import {tradingStats} from '@/lib/paper-performance'
import type {PaperAccount} from '@/lib/paper-trading-types'
import {usd} from './paper-order-ticket'
function equityDrawdown(account: PaperAccount) {
  let peak = account.startingCash
  const points = []
  for (const {date, equity} of account.history) {
    peak = Math.max(peak, equity)
    points.push({date, value: 100 * (equity / peak - 1)})
  }
  return points
}

export function PaperTradeStats({account}:{account:PaperAccount}){const s=tradingStats(account.trades);const drawdown=equityDrawdown(account);return <><h3>Closed-trade performance</h3><div className="paper-metrics">{Object.entries({'Win rate':s.winRate===null?'—':(100*s.winRate).toFixed(1)+'%','Profit factor':s.factor?.toFixed(2)??'—','Average win':usd(s.avgWin),'Average loss':usd(s.avgLoss),'Expectancy per exit':usd(s.expectancy),'Average holding time':s.hours===null?'—':s.hours.toFixed(1)+' h'}).map(([label,v])=><article className="metric-card" key={label}><span>{label}</span><strong>{v}</strong></article>)}</div><p className="paper-note">Each sale, including a partial exit, is one observation. Holding time uses the share-weighted average entry time. Undefined ratios are shown as a dash.</p><h3>Equity drawdown (%)</h3><ChartContainer className="h-40 w-full" config={{value:{label:'Drawdown (%)',color:'var(--chart-3)'}}}><LineChart accessibilityLayer data={drawdown}><YAxis width={60}/><Line dataKey="value" stroke="var(--color-value)" dot={drawdown.length===1} isAnimationActive={false}/></LineChart></ChartContainer><h3>Trade return distribution</h3>{s.n?<ChartContainer className="h-40 w-full" config={{count:{label:'Sales',color:'var(--chart-2)'}}}><BarChart accessibilityLayer data={['Below −5%','−5% to <0','Flat','0 to 5%','Above 5%'].map((range,i)=>({range,count:s.bins[i]}))}><XAxis dataKey="range"/><YAxis width={40} allowDecimals={false}/><Bar dataKey="count" fill="var(--color-count)"/></BarChart></ChartContainer>:<p className="paper-note">No exits yet. Returns appear after shares are sold.</p>}</>}
