import { createSubscription } from '../services/subscriptions.js';
import { intelligenceRouter } from './intelligence.js';
import { Router } from 'express';
import * as schemas from '../services/schemas.js';
import * as finance from '../services/finance.js';
const parse=schemas.parse;
export function apiRouter(clock=finance.today){
 const router=Router();
 router.use('/intelligence',intelligenceRouter(clock));
 const success=(res,data,status=200)=>res.status(status).json({data});
 for(const table of ['subscriptions','transactions']){
  router.get(`/${table}`,async(req,res)=>{const filter=parse(schemas.filters,req.query);if(filter.from&&filter.to&&filter.from>filter.to)throw Object.assign(new Error('Invalid date range'),{status:400,code:'VALIDATION_ERROR'});const allowed=table==='subscriptions'?['Active','Paused','Cancelled']:['Completed','Pending','Reversed'];if(filter.status&&!allowed.includes(filter.status))throw Object.assign(new Error('Invalid status'),{status:400,code:'VALIDATION_ERROR'});const result=await req.repository.list(table,filter);res.json({data:result.rows,pagination:{page:result.page,limit:result.limit,total:result.total}});});
  router.post(`/${table}`,async(req,res)=>success(res,table==='subscriptions'?await createSubscription(req.repository,req.body):await req.repository.create(table,parse(schemas.transaction,req.body)),201));
  router.get(`/${table}/:id`,async(req,res)=>success(res,await req.repository.get(table,parse(schemas.id,req.params.id))));
  router.patch(`/${table}/:id`,async(req,res)=>success(res,await req.repository.update(table,parse(schemas.id,req.params.id),parse(table==='subscriptions'?schemas.subscriptionPatch:schemas.transactionPatch,req.body))));
  router.delete(`/${table}/:id`,async(req,res)=>{await req.repository.delete(table,parse(schemas.id,req.params.id));success(res,{deleted:true});});
 }
 router.post('/transactions/imports',async(req,res)=>{const {rows}=parse(schemas.importBody,req.body);const batch=parse(schemas.transaction.shape.batchKey,req.get('Idempotency-Key'));success(res,{inserted:await req.repository.import(rows,batch)},201);});
 router.get('/notifications',async(req,res)=>{const filter=parse(schemas.filters.pick({page:true,limit:true}),req.query);const r=await req.repository.list('notifications',filter);res.json({data:r.rows,pagination:{page:r.page,limit:r.limit,total:r.total}});});
 router.patch('/notifications/:id/read',async(req,res)=>{parse(schemas.subscription.pick({}).strict(),req.body||{});success(res,await req.repository.update('notifications',parse(schemas.id,req.params.id),{read_at:new Date().toISOString()}));});
 router.delete('/notifications/:id',async(req,res)=>{await req.repository.delete('notifications',parse(schemas.id,req.params.id));success(res,{deleted:true});});
 async function data(req){return {plans:await req.repository.all('subscriptions'),transactions:await req.repository.all('transactions')};}
 const options=req=>{const p=parse(schemas.period,req.query);return parse(schemas.period,{...p,from:p.from||clock().slice(0,7)+'-01',to:p.to||clock()});};
 router.get('/dashboard/summary',async(req,res)=>{const o=options(req);const {plans,transactions}=await data(req);success(res,finance.summarize(plans,transactions,o));});
 router.get('/dashboard/spending',async(req,res)=>{const o=options(req);success(res,finance.spending(await req.repository.all('transactions'),o));});
 router.get('/dashboard/category-breakdown',async(req,res)=>{const o=options(req);success(res,finance.categories(await req.repository.all('subscriptions'),o.currency));});
 for(const path of ['/calendar','/dashboard/upcoming-payments'])router.get(path,async(req,res)=>{const p=parse(schemas.period,req.query);const o={...p,from:p.from||clock(),to:p.to||finance.addDays(clock(),30)};if(o.from>o.to)throw Object.assign(new Error('Invalid date range'),{status:400,code:'VALIDATION_ERROR'});success(res,finance.calendar(await req.repository.all('subscriptions'),o));});
 return router;
}
