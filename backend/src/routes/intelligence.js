import { Router } from 'express';
import { z } from 'zod';
import { createSubscription } from '../services/subscriptions.js';
import { upcomingPredictions } from '../services/intelligence/prediction.js';
import { id,filters,date,currency } from '../services/schemas.js';
import { analyzeTransactions,recurringSummary } from '../services/intelligence/index.js';
import { advance } from '../services/intelligence/utils.js';
import { today } from '../services/finance.js';
const pageSchema=filters.pick({page:true,limit:true});
export function intelligenceRouter(clock=today){const router=Router();
 const analyze=async(req,res)=>{z.strictObject({}).parse(req.body);const asOf=clock();const windowStart=advance(asOf,-5,'Yearly');const rows=await req.repository.all('transactions',{from:windowStart,to:asOf});const result=analyzeTransactions(rows,{userId:req.user.id,asOf});await req.repository.persistIntelligence(result);res.json({data:{ruleVersion:result.ruleVersion,asOf,suggestionCount:result.suggestions.length,findingCount:result.findings.length,windowStart,persisted:true}});};
 router.post('/detect-recurring',analyze);router.post('/analyze-transactions',analyze);
 for(const [path,table] of [['suggestions','recurring_detection_suggestions'],['anomalies','transaction_anomalies'],['duplicates','transaction_anomalies']])router.get(`/${path}`,async(req,res)=>{const q=pageSchema.parse(req.query);const result=await req.repository.intelligenceList(table,{...q,kind:path});res.json({data:result.rows,pagination:{page:result.page,limit:result.limit,total:result.total}});});
 router.get('/suggestions/:id',async(req,res)=>res.json({data:await req.repository.suggestion(id.parse(req.params.id))}));
 for(const decision of ['confirm','reject'])router.post(`/suggestions/:id/${decision}`,async(req,res)=>{
 z.strictObject({}).parse(req.body);const key=id.parse(req.params.id);const row=await req.repository.suggestion(key);
 let subscriptionId=null;
 if(decision==='confirm'){
   if(row.state==='Confirmed')subscriptionId=await req.repository.reviewSuggestion(key,decision);
   else {const created=await createSubscription(req.repository,{name:row.merchant,category:'Other',amountMinor:String(row.amount_minor),currency:row.currency,frequency:row.frequency,nextRenewal:row.payload.prediction.nextPaymentDate},{suggestionId:key});subscriptionId=created.id;}
 }else await req.repository.reviewSuggestion(key,decision);
 res.json({data:{subscriptionId,decision}});
 });
 router.get('/upcoming-payments',async(req,res)=>{
 const q=z.strictObject({page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(100).default(25),from:date.optional(),to:date.optional(),currency:currency.optional()}).refine(v=>!v.from||!v.to||v.from<=v.to,'Invalid date range').parse(req.query);
 const predictions=upcomingPredictions(await req.repository.all('subscriptions'),await req.repository.all('recurring_detection_suggestions'),await req.repository.all('transactions'),clock()).filter(p=>(!q.currency||p.currency===q.currency)&&(!q.from||p.nextPaymentDate>=q.from)&&(!q.to||p.nextPaymentDate<=q.to));
 res.json({data:predictions.slice((q.page-1)*q.limit,q.page*q.limit),pagination:{page:q.page,limit:q.limit,total:predictions.length}});
 });
 router.get('/summary',async(req,res)=>{z.strictObject({}).parse(req.query);res.json({data:recurringSummary(await req.repository.all('subscriptions'),{transactions:await req.repository.all('transactions'),asOf:clock()})});});return router;
}
