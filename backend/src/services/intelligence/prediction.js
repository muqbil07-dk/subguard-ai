import { normalizeMerchant } from './merchants.js';
import { advance,days } from './utils.js';
export function predict({anchor,lastPaymentDate,frequency,amountMinor,currency,confidence},asOf){if(!lastPaymentDate||!frequency)return {predicted:true,state:'unknown',nextPaymentDate:null};let index=1;while(index<6000&&advance(anchor,index,frequency)<=lastPaymentDate)index++;const nextPaymentDate=advance(anchor,index,frequency);return {asOf,predicted:true,lastPaymentDate,nextPaymentDate,amountMinor,currency,frequency,daysRemaining:days(asOf,nextPaymentDate),confidence,state:nextPaymentDate<asOf?'overdue':'expected',explanation:nextPaymentDate<asOf?'Overdue estimate retained; no payment assumed.':'Calendar-based estimate; not a completed payment.'};}

// Confirmed, user-maintained renewal anchors take priority over stale detection
// estimates. Matching history provides a last observed payment, not a guarantee.
export function upcomingPredictions(plans,suggestions,transactions,asOf){
 const result=[];
 const confirmed=new Set(plans.map(p=>p.id));
 for(const row of suggestions){
  if(!['Suggested','Confirmed'].includes(row.state)||(row.subscription_id&&confirmed.has(row.subscription_id)))continue;
  if(row.state==='Confirmed')continue; // deleted confirmed tracking is not resurrected
  const prediction=row.payload.prediction;
  if(prediction?.nextPaymentDate)result.push({...prediction,analysisAsOf:prediction.asOf,asOf,daysRemaining:days(asOf,prediction.nextPaymentDate),state:prediction.nextPaymentDate<asOf?'overdue':'expected',reviewStatus:row.state,merchant:row.merchant,suggestionId:row.id});
 }
 const histories=new Map();
 for(const row of transactions){if(row.status!=='Completed'||row.direction!=='debit'||row.date>asOf)continue;const key=JSON.stringify([normalizeMerchant(row.merchant).identity,row.currency]);const last=histories.get(key);if(!last||row.date>last)histories.set(key,row.date);}
 for(const plan of plans.filter(p=>p.status==='Active')){
  if(!plan.nextRenewal)continue;
  result.push({asOf,predicted:true,merchant:plan.name,subscriptionId:plan.id,reviewStatus:'Confirmed',lastPaymentDate:histories.get(JSON.stringify([normalizeMerchant(plan.name).identity,plan.currency]))||null,nextPaymentDate:plan.nextRenewal,amountMinor:plan.amountMinor,currency:plan.currency,frequency:plan.frequency,confidence:null,daysRemaining:days(asOf,plan.nextRenewal),state:plan.nextRenewal<asOf?'overdue':'expected',explanation:'User-maintained renewal anchor; no unobserved payment assumed.'});
 }
 return result.sort((a,b)=>a.nextPaymentDate.localeCompare(b.nextPaymentDate)||a.merchant.localeCompare(b.merchant));
}
