import { days,median,key,advance } from './utils.js';
import { scoreEvidence } from './confidence.js';
import { predict } from './prediction.js';
const frequencies=[['Weekly',6,8],['Monthly',25,35],['Quarterly',80,100],['Half-yearly',170,195],['Yearly',350,380]];
export function detect(group,asOf,overrides={}){
 const config={amountTolerancePercent:10,minimumIntervalConsistency:.6,...overrides};
 const sorted=[...group.rows].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 // Same/adjacent-date charges remain duplicate evidence, not extra cadence observations.
 const rows=sorted.filter((r,i)=>i===0||days(sorted[i-1].date,r.date)>1);
 const amounts=rows.map(r=>BigInt(r.amountMinor)),baseline=median(amounts)||0n;
 const intervals=rows.slice(1).map((r,i)=>days(rows[i].date,r.date));
 const matches=frequencies.map(([frequency,min,max])=>({frequency,ratio:intervals.length?intervals.filter(n=>n>=min&&n<=max).length/intervals.length:0})).sort((a,b)=>b.ratio-a.ratio);
 const best=matches[0],consistent=baseline>0n?amounts.filter(n=>(n>baseline?n-baseline:baseline-n)*100n<=baseline*BigInt(config.amountTolerancePercent)).length/amounts.length:0;
 const tolerance={Weekly:2,Monthly:5,Quarterly:10,'Half-yearly':15,Yearly:15}[best.frequency];
 const intervalConsistency=rows.length>1?1-rows.slice(1).reduce((sum,r,i)=>sum+Math.min(1,Math.abs(days(advance(rows[0].date,i+1,best.frequency),r.date))/tolerance),0)/(rows.length-1):0;
 const confidence=scoreEvidence({count:rows.length,intervalConsistency,amountConsistency:consistent,merchantConfidence:group.merchant.confidence,frequencyStability:best.ratio},config.scoreThresholds);
 const state=rows.length<2?'Insufficient evidence':best.ratio<config.minimumIntervalConsistency||consistent<.5?'Insufficient evidence':'Suggested';
 const last=rows.at(-1);const frequency=state==='Suggested'?best.frequency:null;
 return {dedupe_key:key(group.source,group.merchant.identity,group.currency,group.stream||'single'),merchant:group.merchant.original,identity:group.merchant.identity,source:group.source,currency:group.currency,amountMinor:baseline.toString(),frequency,lastPaymentDate:last?.date||null,confidence:confidence.score,classification:confidence.classification,scoreBreakdown:confidence.breakdown,explanation:confidence.explanation,state,evidence:rows.map(r=>r.id),prediction:predict({anchor:rows[0]?.date,lastPaymentDate:last?.date,frequency,amountMinor:baseline.toString(),currency:group.currency,confidence:confidence.score},asOf)};
}
