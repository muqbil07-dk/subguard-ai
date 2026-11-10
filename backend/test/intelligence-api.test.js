import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ApiError } from '../src/utils/errors.js';
const id='11111111-1111-4111-8111-111111111111';
function setup(){
 const owners={a:{suggestions:[],findings:[],subscriptions:[]},b:{suggestions:[],findings:[],subscriptions:[]}};
 const transactions=['2026-01-10','2026-02-10','2026-03-10','2026-04-10'].map((date,i)=>({id:`t${i}`,merchant:'Netflix',currency:'INR',amountMinor:i===3?'79900':'64900',direction:'debit',status:'Completed',date}));
 const app=createApp({clock:()=> '2026-04-11',authenticate:async token=>{
  if(!owners[token])throw new ApiError(401,'UNAUTHORIZED','Invalid token');const state=owners[token];
  const repo={
   async all(table){return table==='transactions'?token==='a'?transactions:[]:table==='subscriptions'?state.subscriptions:state.suggestions;},
   async persistIntelligence(result){state.suggestions=result.suggestions.map(payload=>{const old=state.suggestions.find(s=>s.dedupe_key===payload.dedupe_key);return {...payload,id,user_id:token,amount_minor:payload.amountMinor,payload,state:old?.state||payload.state,subscription_id:old?.subscription_id}});state.findings=result.findings;},
   async suggestion(key){const row=state.suggestions.find(s=>s.id===key);if(!row)throw new ApiError(404,'NOT_FOUND','Suggestion not found');return row;},
   async intelligenceList(table,{page,limit,kind}){const all=table==='recurring_detection_suggestions'?state.suggestions:state.findings.filter(f=>kind==='duplicates'?f.type==='possible_duplicate':f.type!=='possible_duplicate');return {rows:all.slice((page-1)*limit,page*limit),total:all.length,page,limit};},
   async reviewSuggestion(key,decision){const row=await this.suggestion(key);if(decision==='reject'){row.state='Rejected';return null}if(row.state!=='Confirmed'){state.subscriptions.push({id,name:row.merchant,category:'Other',amountMinor:String(row.amount_minor),currency:row.currency,frequency:row.frequency,status:'Active',nextRenewal:row.payload.prediction.nextPaymentDate});row.state='Confirmed';row.subscription_id=id;}return id;},
   async get(_table,key){return state.subscriptions.find(s=>s.id===key);},
  };return {user:{id:token},repository:repo};
 }});return {app,owners};
}
const auth=(agent,method,path,user='a')=>agent[method](path).set('Authorization',`Bearer ${user}`);
test('intelligence HTTP analysis, persistence replay, pagination, forecasts, summary and review',async()=>{
 const {app,owners}=setup(),a=request(app);assert.equal((await a.get('/api/intelligence/suggestions')).status,401);
 let result=await auth(a,'post','/api/intelligence/analyze-transactions').send({});assert.equal(result.status,200);assert.equal(result.body.data.persisted,true);assert.equal(result.body.data.suggestionCount,1);
 assert.equal((await auth(a,'post','/api/intelligence/detect-recurring').send({})).status,200);assert.equal(owners.a.suggestions.length,1);
 result=await auth(a,'get','/api/intelligence/suggestions?limit=1&page=2');assert.equal(result.body.data.length,0);assert.equal(result.body.pagination.total,1);
 assert.equal((await auth(a,'get',`/api/intelligence/suggestions/${id}`)).status,200);
 assert.equal((await auth(a,'get','/api/intelligence/anomalies')).body.data[0].type,'price_increase');
 assert.equal((await auth(a,'get','/api/intelligence/duplicates')).body.data.length,0);
 result=await auth(a,'get','/api/intelligence/upcoming-payments');assert.equal(result.body.data[0].predicted,true);
 assert.equal((await auth(a,'post',`/api/intelligence/suggestions/${id}/confirm`).send({})).status,200);
 await auth(a,'post',`/api/intelligence/suggestions/${id}/confirm`).send({});assert.equal(owners.a.subscriptions.length,1);
 result=await auth(a,'get','/api/intelligence/summary');assert.equal(result.body.data[0].currency,'INR');
 assert.equal((await auth(a,'get','/api/intelligence/upcoming-payments')).body.data.length,1);
});
test('all review/read operations use verified owner and reject client ownership fields',async()=>{
 const {app}=setup(),a=request(app);await auth(a,'post','/api/intelligence/detect-recurring').send({});
 for(const action of ['confirm','reject'])assert.equal((await auth(a,'post',`/api/intelligence/suggestions/${id}/${action}`,'b').send({})).status,404);
 assert.equal((await auth(a,'get',`/api/intelligence/suggestions/${id}`,'b')).status,404);
 assert.equal((await auth(a,'get','/api/intelligence/suggestions','b')).body.data.length,0);
 assert.equal((await auth(a,'post','/api/intelligence/analyze-transactions').send({userId:'b'})).status,400);
 assert.equal((await auth(a,'post',`/api/intelligence/suggestions/${id}/confirm`).send({user_id:'b'})).status,400);
 assert.equal((await auth(a,'get','/api/intelligence/suggestions?limit=101')).status,400);
 assert.equal((await auth(a,'get','/api/intelligence/upcoming-payments?from=2026-05-01&to=2026-04-01')).status,400);
 assert.equal((await auth(a,'post',`/api/intelligence/suggestions/${id}/reject`).send({})).status,200);
 await auth(a,'post','/api/intelligence/detect-recurring').send({});assert.equal((await auth(a,'get',`/api/intelligence/suggestions/${id}`)).body.data.state,'Rejected');
});
