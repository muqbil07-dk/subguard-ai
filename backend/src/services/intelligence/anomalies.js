import { days,median,key } from './utils.js';
export function anomalies(group,candidate,overrides={}){
 const config={pricePercent:5,unexpectedPercent:50,...overrides};
 const rows=[...group.rows].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)),results=[];
 for(let i=1;i<rows.length;i++){
 const current=rows[i],prior=rows.slice(Math.max(0,i-3),i),baseline=median(prior.map(r=>BigInt(r.amountMinor))),amount=BigInt(current.amountMinor),difference=amount-baseline,absolute=difference<0n?-difference:difference;
 const add=(type,explanation)=>results.push({dedupe_key:key(type,current.id,group.currency),type,merchant:current.merchant,currency:group.currency,previousAmountMinor:baseline.toString(),newAmountMinor:amount.toString(),differenceMinor:absolute.toString(),percentageDifference:baseline?Number(difference*10000n/baseline)/100:null,severity:type==='unexpected_amount'?'high':'review',explanation,evidence:[...prior.map(r=>r.id),current.id]});
 if(prior.length>=3&&absolute>=BigInt(group.currency==='JPY'?1:100)&&absolute*100n>baseline*BigInt(config.pricePercent))add(difference>0n?'price_increase':'price_decrease','Compared with the median of three prior completed charges in the same currency.');
 if(prior.length>=3&&absolute*100n>baseline*BigInt(config.unexpectedPercent))add('unexpected_amount','Material deviation from established same-currency baseline.');
 const interval=days(rows[i-1].date,current.date),expected={Weekly:[6,8],Monthly:[25,35],Quarterly:[80,100],'Half-yearly':[170,195],Yearly:[350,380]}[candidate.frequency];
 if(expected&&i>=3&&interval>1&&(interval<expected[0]||interval>expected[1]))add('irregular_interval',`Observed ${interval} days, outside the ${candidate.frequency} interval range.`);
 }return results;
}
export function duplicates(group){const buckets=new Map(),results=[];for(const row of [...group.rows].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){const previous=buckets.get(row.amountMinor);if(previous&&days(previous.date,row.date)<=1)results.push({dedupe_key:key('duplicate',previous.id,row.id),type:'possible_duplicate',merchant:row.merchant,currency:row.currency,newAmountMinor:row.amountMinor,severity:'review',evidence:[previous.id,row.id],explanation:'Distinct completed charges on matching/adjacent dates. Date-only precision; may be legitimate. No record deleted.'});buckets.set(row.amountMinor,row);}return results;}
