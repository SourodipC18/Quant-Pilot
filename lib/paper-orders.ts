import { z } from 'zod'
import { estimateOrder, parseOrderAmount, PaperError, type PaperCosts } from './paper-trading-math'

export const kinds = ['market','limit','stop','stop-limit','stop-loss','take-profit','bracket'] as const
const price = z.number().finite().min(0.000001).max(10_000_000)
export const termsSchema = z.object({kind:z.enum(kinds),side:z.enum(['buy','sell']),amount:z.string().max(18),tif:z.enum(['Day','GTC']),limit:price.optional(),stop:price.optional(),target:price.optional()})
export type Terms = z.infer<typeof termsSchema>
export const riskSchema = z.object({position:z.number().positive().max(100).optional(),concentration:z.number().positive().max(100).optional(),order:z.number().positive().max(100_000_000).optional(),loss:z.number().positive().max(100_000_000).optional()})
export type Limits = z.infer<typeof riskSchema>
export type Journal = {notes?:string;reason?:string;tags?:string}
export type Status = 'pending'|'filled'|'cancelled'|'rejected'|'expired'
export type SimOrder = Terms & {id:string;symbol:string;status:Status;since:string;expiry:string|null;reserve:string;group?:string;triggered?:boolean;lastBar?:string;executionPrice?:number;history:{at:string;status:Status;message:string}[]}
export const micros = (x:number) => BigInt(Math.round(x*1e6))
export function validateTerms(t:Terms, reference:bigint) {
  parseOrderAmount(t.amount,'shares')
  if (['limit','stop-limit'].includes(t.kind) && !t.limit || ['stop','stop-limit','stop-loss','bracket'].includes(t.kind) && !t.stop || ['take-profit','bracket'].includes(t.kind) && !t.target) throw new PaperError('Required order price is missing.')
  if ((t.kind==='stop-loss'||t.kind==='take-profit') && t.side!=='sell' || t.kind==='bracket' && t.side!=='buy') throw new PaperError('Protective exits must sell; bracket entries must buy.')
  if(t.kind==='bracket' && !(micros(t.stop!)<reference && reference<micros(t.target!))) throw new PaperError('Bracket prices must surround the entry price.')
}
const clock = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
function session(d:Date){const p=Object.fromEntries(clock.formatToParts(d).map(x=>[x.type,x.value]));return {weekday:!['Sat','Sun'].includes(p.weekday),seconds:+p.hour*3600 + +p.minute*60 + +p.second}}
export function expiry(tif:Terms['tif'],now:Date){if(tif==='GTC')return null;const s=session(now);if(!s.weekday||s.seconds>=57600)throw new PaperError('Day orders are accepted on weekdays before 16:00 New York time.');return new Date(Math.floor(+now/1000)*1000+(57600-s.seconds)*1000).toISOString()}
export function executableBar(date:string,now:Date){const s=session(now),age=+now-Date.parse(date);return date.length>10 && s.weekday && s.seconds>=34500 && s.seconds<57600 && age>=0 && age<300000}
export function matchOrder(o:SimOrder,reference:bigint,date:string,costs:PaperCosts,now:Date){
  if(o.status!=='pending'||!executableBar(date,now)||date===o.lastBar||Date.parse(date)<=Date.parse(o.since))return {fill:false,trigger:false}
  const buy=o.side==='buy', est=estimateOrder(o.side,'shares',o.amount,reference,costs)
  const crossed=o.stop!==undefined && (buy?reference>=micros(o.stop):reference<=micros(o.stop))
  if(o.kind==='stop-limit'&&!o.triggered)return {fill:false,trigger:crossed}
  if(o.kind==='stop'||o.kind==='stop-loss')return {fill:crossed,trigger:false}
  if(o.kind==='limit'||o.kind==='stop-limit'||o.kind==='take-profit'){const limit=micros((o.kind==='take-profit'?o.target:o.limit)!);return {fill:buy?est.fillMicros<limit:est.fillMicros>limit,trigger:false}}
  return {fill:true,trigger:false}
}
export function reservations(orders:SimOrder[],symbol:string,exclude?:SimOrder){let cash=0n;const groups=new Map<string,bigint>();for(const o of orders){if(o.status!=='pending'||o.id===exclude?.id||exclude?.group&&o.group===exclude.group)continue;if(o.side==='buy')cash+=BigInt(o.reserve);else if(o.symbol===symbol){const k=o.group??o.id,u=parseOrderAmount(o.amount,'shares');if((groups.get(k)??0n)<u)groups.set(k,u)}}return {cash,units:[...groups.values()].reduce((a,b)=>a+b,0n)}}
export function event(o:SimOrder,status:Status,message:string){o.status=status;o.history.push({at:new Date().toISOString(),status,message});return o}
