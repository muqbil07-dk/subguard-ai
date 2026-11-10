export function scoreEvidence({count,intervalConsistency,amountConsistency,merchantConfidence,frequencyStability=intervalConsistency},{veryHigh=90,high=75,moderate=50}={}) {
 const breakdown={count:count>=4?35:count===3?25:count===2?5:0,interval:25*intervalConsistency,amount:20*amountConsistency,merchant:10*merchantConfidence/100,frequency:10*frequencyStability};
 const score=Math.min(count<3?49:100,Math.round(Object.values(breakdown).reduce((a,b)=>a+b,0)));
 return {score,classification:score>=veryHigh?'Very high':score>=high?'High':score>=moderate?'Moderate':'Low',breakdown,explanation:`${count} observations; interval consistency ${Math.round(intervalConsistency*100)}%; amount consistency ${Math.round(amountConsistency*100)}%; merchant confidence ${merchantConfidence}/100; frequency stability ${Math.round(frequencyStability*100)}%. Heuristic score, not probability.`};
}
