import { ApiError } from '../utils/errors.js';
const divide=(n,d)=>(n+d/2n)/d;
export function monthly(plan){const n=BigInt(plan.amountMinor);return ({Weekly:()=>divide(n*52n,12n),Monthly:()=>n,Quarterly:()=>divide(n,3n),'Half-yearly':()=>divide(n,6n),Yearly:()=>divide(n,12n)})[plan.frequency]();}
export const today=()=>new Date().toISOString().slice(0,10);
export function addDays(date,n){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function advance(anchor,index,frequency){if(frequency==='Weekly')return addDays(anchor,7*index);const [y,m,day]=anchor.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+index*({Monthly:1,Quarterly:3,'Half-yearly':6,Yearly:12}[frequency]),1));const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return d.toISOString().slice(0,10);}
export function calendar(plans,{currency,from,to}){
 if((Date.parse(to)-Date.parse(from))/86400000>366)throw new ApiError(400,'VALIDATION_ERROR','Calendar window must not exceed 366 days.');
 const events=[];
 for(const plan of plans.filter(p=>p.status==='Active'&&p.currency===currency)){
  for(let i=0;i<6000;i++){const date=advance(plan.nextRenewal,i,plan.frequency);if(date>to)break;if(date>=from)events.push({...plan,nextRenewal:date});if(events.length>10000)throw new ApiError(422,'DATASET_LIMIT','Too many renewals for this range.');}
 }
 return events.sort((a,b)=>a.nextRenewal.localeCompare(b.nextRenewal)||a.id.localeCompare(b.id));
}
export function summarize(plans,transactions,options){const active=plans.filter(p=>p.status==='Active'&&p.currency===options.currency);const eligible=transactions.filter(t=>t.currency===options.currency&&t.status==='Completed'&&t.date>=options.from&&t.date<=options.to);return {currency:options.currency,from:options.from,to:options.to,activeCount:active.length,monthlyMinor:active.reduce((s,p)=>s+monthly(p),0n).toString(),savingsMinor:active.filter(p=>p.unused).reduce((s,p)=>s+monthly(p),0n).toString(),spentMinor:eligible.reduce((s,t)=>s+(t.direction==='credit'?-1n:1n)*BigInt(t.amountMinor),0n).toString(),transactionCount:eligible.length};}
export function spending(transactions,options){const buckets=new Map();for(const row of transactions){if(row.currency!==options.currency||row.status!=='Completed'||row.date<options.from||row.date>options.to)continue;const month=row.date.slice(0,7);buckets.set(month,(buckets.get(month)||0n)+(row.direction==='credit'?-1n:1n)*BigInt(row.amountMinor));}return [...buckets].sort(([a],[b])=>a.localeCompare(b)).map(([month,n])=>({month,amountMinor:n.toString(),currency:options.currency}));}
export function categories(plans,currency){const totals=new Map();for(const p of plans.filter(p=>p.status==='Active'&&p.currency===currency))totals.set(p.category,(totals.get(p.category)||0n)+monthly(p));return [...totals].map(([category,n])=>({category,amountMinor:n.toString(),currency}));}
