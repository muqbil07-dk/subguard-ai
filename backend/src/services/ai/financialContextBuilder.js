import { redactInput } from './aiSafety.js';
import { recurringSummary } from '../intelligence/spending.js';
import { upcomingPredictions } from '../intelligence/prediction.js';
import { normalizeMerchant } from '../intelligence/merchants.js';
import { key } from '../intelligence/utils.js';
import { monthly,spending,addDays } from '../finance.js';
import { advance } from '../intelligence/utils.js';
import { wasteScore } from './wasteScoreService.js';
import { recommendationCandidates } from './recommendationService.js';
import { ApiError } from '../../utils/errors.js';
export async function buildFinancialContext(repository,{question='',asOf,purpose='chat',insightId}={}){
 const needsFindings=purpose!=='chat'||/change|increase|decrease|charges|review|insight|reduce|save|saving|duplicate/i.test(question);
 const needsUpcoming=purpose!=='chat'||/next|upcoming|renew|week|payment|due/i.test(question);
 const needsTrends=/spend|trend|increase|change/i.test(question);
 const plans=await repository.all('subscriptions');
 const findings=needsFindings?(await repository.all('transaction_anomalies')).filter(f=>f.active):[];
 if(insightId&&!findings.some(f=>f.id===insightId))throw new ApiError(404,'NOT_FOUND','Insight not found.');
 const suggestions=needsUpcoming||/suggest|detect|candidate/i.test(question)?await repository.all('recurring_detection_suggestions'):[];
 const transactions=needsUpcoming||needsTrends?await repository.all('transactions',{from:advance(asOf,-12,'Monthly'),to:asOf}):[];
 const normalizedQuestion=normalizeMerchant(question).identity;
 const facts=[];const add=(id,kind,label,data,operation)=>facts.push({id:key(kind,id),kind,label,...data,...(data.merchant?{matchesQuestion:normalizedQuestion.includes(normalizeMerchant(data.merchant).identity)}:{}),asOf,operation});
 const summary=recurringSummary(plans,needsTrends?{transactions,asOf}:{});
 for(const s of summary){add(s.currency,'monthly_estimate','Confirmed monthly recurring estimate',{amountMinor:s.monthlyMinor,currency:s.currency,basis:'Normalized active plans; estimate'},'getFinancialSummary');add(s.currency,'yearly_estimate','Confirmed estimated yearly recurring spending',{amountMinor:s.yearlyMinor,currency:s.currency,basis:'Cadence factors; estimate'},'getFinancialSummary');}
 const ranked=plans.filter(p=>p.status==='Active').sort((a,b)=>{const match=p=>normalizedQuestion.includes(normalizeMerchant(p.name).identity);return Number(match(b))-Number(match(a))||Number(b.unused)-Number(a.unused)||(monthly(a)>monthly(b)?-1:1)});
 for(const [index,p] of ranked.slice(0,20).entries())add(p.id,'subscription','Confirmed plan amount per billing period',{recordId:p.id,merchant:redactInput(p.name),alias:`Plan ${String.fromCharCode(65+index)}`,amountMinor:p.amountMinor,currency:p.currency,date:p.nextRenewal,frequency:p.frequency,unused:p.unused===true,basis:'User-confirmed tracking, not proof of product usage'},'getSubscriptions');
 for(const f of findings.filter(f=>!insightId||f.id===insightId).slice(0,10)){const p=f.payload;add(f.id,'finding','Advisory billing signal',{recordId:f.id,merchant:redactInput(p.merchant||''),amountMinor:p.newAmountMinor,currency:f.currency,type:f.type,previousAmountMinor:p.previousAmountMinor,differenceMinor:p.differenceMinor,percentageDifference:p.percentageDifference,basis:'Phase 5 heuristic; requires review'},f.type==='possible_duplicate'?'getDuplicateFlags':'getAnomalies');}
 if(needsUpcoming)for(const p of upcomingPredictions(plans,suggestions,transactions,asOf).filter(p=>/next week|this week/i.test(question)?p.nextPaymentDate>=asOf&&p.nextPaymentDate<=addDays(asOf,7):p.nextPaymentDate<=advance(asOf,1,'Monthly')).slice(0,10))add(p.subscriptionId||p.suggestionId,'prediction','Predicted payment, not a completed charge',{merchant:redactInput(p.merchant||''),amountMinor:p.amountMinor,currency:p.currency,date:p.nextPaymentDate,predicted:true,basis:p.reviewStatus==='Confirmed'?'User-maintained renewal anchor':'Unconfirmed suggestion'},'getUpcomingPayments');
 for(const s of suggestions.filter(s=>s.state==='Suggested').slice(0,5))add(s.id,'suggestion','Unconfirmed recurring suggestion',{merchant:redactInput(s.merchant),amountMinor:String(s.amount_minor),currency:s.currency,date:s.payload.prediction?.nextPaymentDate,basis:'Not a confirmed subscription'},'getSubscriptionSuggestions');
 if(needsTrends)for(const currency of [...new Set(transactions.map(t=>t.currency))])for(const row of spending(transactions,{currency,from:asOf.slice(0,7)+'-01',to:asOf}))add(`${currency}-${row.month}`,'completed_spend','Completed net spending this calendar month',{amountMinor:row.amountMinor,currency,basis:'Completed debits less credits; partial month'},'getSpendingTrends');
 const score=wasteScore(plans,findings,asOf);
 if(score.state==='ready')add('score','waste_score','Deterministic review-priority score',{value:score.score,basis:'Explicit unused flags and unreviewed findings; not cost alone'},'getFinancialSummary');
 const wantsRecommendations=purpose==='recommendations'||(purpose==='chat'&&/reduce|saving|unused|recommend|waste|review/i.test(question));
 const dismissed=wantsRecommendations?new Set((await repository.all('ai_recommendation_dismissals')).map(r=>r.recommendation_id)):new Set();
 const recommendations=wantsRecommendations?recommendationCandidates(ranked,facts,findings).filter(r=>!dismissed.has(r.id)):[];
 const warnings=['Financial facts are backend-calculated; suggestions and predictions are not settled payments.','No reliable usage telemetry, budgets, bank connection or financial-adviser capability is available.'];
 if(plans.length>20||findings.length>10||suggestions.length>5)warnings.push('Individual context is limited; aggregates use the bounded complete dataset.');
 const allowedIds=new Set(recommendations.flatMap(r=>r.evidence.map(e=>e.id)));
 const scopedFacts=purpose==='insight'?facts.filter(f=>f.recordId===insightId):purpose==='score'?facts.filter(f=>f.kind==='waste_score'):purpose==='recommendations'?facts.filter(f=>allowedIds.has(f.id)):facts;
 const projected=scopedFacts.map(({merchant:_m,recordId:_r,label:_l,operation:_o,...fact})=>fact);
 // No imported merchant strings, email, account IDs, raw descriptions or secrets
 // are sent to the provider. Human labels remain available only to the UI.
 const model={asOf,facts:projected,recommendations:recommendations.map(r=>({id:r.id,category:r.category,evidenceIds:r.evidence.map(f=>f.id)})),warnings};
 if(Buffer.byteLength(JSON.stringify(model))>24000)throw new ApiError(422,'AI_CONTEXT_LIMIT','Context exceeds the safe model limit.');
 return {facts:scopedFacts,recommendations,score,model,operations:[...new Set(scopedFacts.map(f=>f.operation))],asOf,warnings};
}
