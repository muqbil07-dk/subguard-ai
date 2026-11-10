import { monthly } from '../finance.js';
import { advance } from '../intelligence/utils.js';
import { key } from '../intelligence/utils.js';
export function recommendationCandidates(plans,facts,findings){
 const result=[];
 for(const p of plans.filter(p=>p.status==='Active')){
 const fact=facts.find(f=>f.recordId===p.id&&f.kind==='subscription');if(!fact)continue;
 if(p.frequency==='Yearly'&&p.nextRenewal>=fact.asOf&&p.nextRenewal<=advance(fact.asOf,1,'Monthly'))result.push({id:key('annual-renewal',p.id,p.nextRenewal),title:'Check an upcoming annual renewal',explanation:'Review the renewal terms before the predicted date.',category:'annual_renewal',evidence:[fact],estimatedSavings:null,currency:p.currency,priority:'high',confidence:'user_maintained_renewal_anchor',suggestedNextAction:'Check the plan and merchant terms; the renewal is a prediction.'});
 const unused=p.unused===true;
 if(unused||result.filter(r=>r.category==='cost_review').length<3){const yearly=BigInt(p.amountMinor)*BigInt({Weekly:52,Monthly:12,Quarterly:4,'Half-yearly':2,Yearly:1}[p.frequency]);result.push({id:key(unused?'unused':'cost',p.id),title:unused?'Review a plan you marked unused':'Review this recurring plan',explanation:'Review the plan and merchant terms before deciding.',category:unused?'marked_unused':'cost_review',evidence:[fact],estimatedSavings:unused?{monthlyMinor:monthly(p).toString(),yearlyMinor:yearly.toString(),currency:p.currency,assumptions:'Potential reduction only if you choose to cancel this confirmed plan with its merchant; fees and timing can change the outcome. Not confirmed or guaranteed savings.'}:null,currency:p.currency,priority:unused?'high':'normal',confidence:unused?'explicit_user_flag_and_confirmed_plan':'confirmed_plan_cost_review',suggestedNextAction:'Review with the merchant; no automatic cancellation.'});}
 }
 for(const f of findings.filter(f=>f.active).slice(0,10)){const fact=facts.find(item=>item.recordId===f.id);if(!fact)continue;result.push({id:key('finding',f.id),insightId:f.id,title:f.type==='possible_duplicate'?'Review a possible duplicate':'Inspect a billing signal',explanation:'Check the original records before taking action.',category:'billing_review',evidence:[fact],estimatedSavings:null,currency:f.currency,priority:'high',confidence:'unconfirmed_advisory_evidence',suggestedNextAction:'Compare source records and contact the merchant if needed.'});}
 return result.slice(0,15);
}
