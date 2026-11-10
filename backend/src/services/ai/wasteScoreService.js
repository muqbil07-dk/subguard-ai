import { key } from '../intelligence/utils.js';
export function wasteScore(plans,findings,asOf){
 const active=plans.filter(p=>p.status==='Active'),unused=active.filter(p=>p.unused===true),review= findings.filter(f=>f.active&&f.review_status==='unreviewed');
 if(!active.length)return {state:'insufficient_data',score:null,category:'Insufficient data',factors:[],evidence:[],calculatedAt:asOf,explanation:null};
 const usagePoints=Math.floor(unused.length*80/active.length),alertPoints=Math.min(20,review.length*5);
 const usageId=key('usage',unused.map(p=>p.id).sort()),alertId=key('review',review.map(f=>f.id).sort());
 return {state:'ready',score:Math.min(100,usagePoints+alertPoints),category:usagePoints+alertPoints>=60?'High review priority':usagePoints+alertPoints>=25?'Moderate review priority':'Low known review priority',factors:[{label:'Explicitly marked unused share',points:usagePoints,evidenceId:usageId},{label:'Unreviewed advisory findings',points:alertPoints,evidenceId:alertId}],evidence:[{id:usageId,label:'Active plans explicitly marked unused',value:unused.length,kind:'usage',asOf},{id:alertId,label:'Unreviewed findings (not confirmed fraud or billing errors)',value:review.length,kind:'findings',asOf}],calculatedAt:asOf,explanation:null,limitations:['No budget or reliable product-usage history is available. Cost alone does not increase the score.','Zero means no known review signals, not proof that spending is efficient.']};
}
