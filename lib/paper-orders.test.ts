import {describe,expect,it} from 'vitest'
import {matchOrder, micros, type SimOrder} from './paper-orders'

const since = '2025-11-04T15:00:00Z'
const date = '2025-11-04T15:05:00Z'
const costs = {commissionBps:0,slippageBps:0}
const base:SimOrder = {id:'test',symbol:'AAPL',kind:'limit',side:'buy',amount:'1',tif:'GTC',since,expiry:null,reserve:'0',status:'pending',history:[]}

describe('conditional order rules',()=>{
  it.each([
    ['limit','buy',99,true], ['limit','buy',100,false], ['limit','sell',101,true], ['limit','sell',100,false],
    ['stop','buy',105,true], ['stop','buy',95,false], ['stop','sell',95,true], ['stop','sell',105,false],
    ['take-profit','sell',100,false], ['take-profit','sell',101,true], ['stop-loss','sell',80,true],
  ] as const)('%s %s at %d: fill %s',(kind,side,price,fill)=>{
    expect(matchOrder({...base,kind,side,stop:100,target:100,limit:100},micros(price),date,costs,new Date(date)).fill).toBe(fill)
  })
  it('does not fill on an old, future, or end-of-day mark',()=>{
    for(const time of [since,'2025-11-04T15:10:00Z','2025-11-04']){
      expect(matchOrder({...base,limit:100},micros(90),time,costs,new Date(date)).fill).toBe(false)
    }
  })
  it('applies slippage before checking the limit',()=>{
    expect(matchOrder({...base,limit:100},micros(99.9),date,{...costs,slippageBps:20},new Date(date)).fill).toBe(false)
  })
})
