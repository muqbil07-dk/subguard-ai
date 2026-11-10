import { monthly } from '../finance.js';
import { advance,eligible } from './utils.js';
import { normalizeMerchant } from './merchants.js';
function percentage(delta,baseline){if(!baseline)return null;const negative=delta<0n;const n=(negative?-delta:delta)*10000n/baseline;return `${negative?'-':''}${n/100n}.${String(n%100n).padStart(2,'0')}`;}
export function recurringSummary(subscriptions,{transactions,asOf}={}){
 const currencies=new Map();
 for(const p of subscriptions.filter(p=>p.status==='Active')){
  if(!currencies.has(p.currency))currencies.set(p.currency,{currency:p.currency,monthlyMinor:0n,yearlyMinor:0n,subscriptionCount:0,byMerchant:Object.create(null),byCategory:Object.create(null),highestCost:[],identities:new Set()});
  const b=currencies.get(p.currency),n=monthly(p);b.monthlyMinor+=n;b.yearlyMinor+=BigInt(p.amountMinor)*BigInt({Weekly:52,Monthly:12,Quarterly:4,'Half-yearly':2,Yearly:1}[p.frequency]);b.subscriptionCount++;b.byMerchant[p.name]=(BigInt(b.byMerchant[p.name]||0)+n).toString();b.byCategory[p.category]=(BigInt(b.byCategory[p.category]||0)+n).toString();b.highestCost.push({id:p.id,merchant:p.name,monthlyMinor:n.toString()});b.identities.add(normalizeMerchant(p.name).identity);
 }
 return [...currencies.values()].map(({identities,...b})=>{
  let changes=null;
  if(transactions&&asOf){const currentStart=asOf.slice(0,7)+'-01',previousEnd=advance(asOf,-1,'Monthly'),previousStart=previousEnd.slice(0,7)+'-01';let current=0n,previous=0n;
   for(const t of transactions){if(t.currency!==b.currency||t.status!=='Completed'||!identities.has(normalizeMerchant(t.merchant).identity))continue;if(!eligible(t)&&t.direction!=='credit')continue;const n=BigInt(t.amountMinor)*(t.direction==='credit'?-1n:1n);if(t.date>=currentStart&&t.date<=asOf)current+=n;if(t.date>=previousStart&&t.date<=previousEnd)previous+=n;}
   changes={currentFrom:currentStart,currentTo:asOf,previousFrom:previousStart,previousTo:previousEnd,currentMinor:current.toString(),previousMinor:previous.toString(),differenceMinor:(current-previous).toString(),percentageDifference:previous>0n?percentage(current-previous,previous):null,basis:'Completed net spending at tracked merchants; partial calendar periods, not historical plan-price snapshots.'};
  }
  return {...b,monthlyMinor:b.monthlyMinor.toString(),yearlyMinor:b.yearlyMinor.toString(),highestCost:b.highestCost.sort((a,c)=>BigInt(a.monthlyMinor)>BigInt(c.monthlyMinor)?-1:1).slice(0,5),estimated:true,changes,changesExplanation:changes?'Observed tracked-merchant spending comparison; coverage may be incomplete.':'Historical confirmed-plan snapshots are unavailable; changes are not invented.'};
 });
}
