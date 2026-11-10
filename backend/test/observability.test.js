import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ApiError } from '../src/utils/errors.js';
import { createMonitor, routeLabel, safeLog } from '../src/services/observability.js';
const id='11111111-1111-4111-8111-111111111111';
const authorize=req=>req.set('Authorization','Bearer synthetic-private-token');
const authenticate=async()=>({user:{id},repository:{get:async()=>({id}),list:async()=>({rows:[],total:0,page:1,limit:25})}});

test('operational HTTP events have fixed route labels, error category, status and request latency without private fields',async()=>{
 const records=[];const app=createApp({authenticate,monitor:row=>records.push(row)});
 const res=await authorize(request(app).get(`/api/v1/subscriptions/${id}?merchant=private-merchant`));
 assert.equal(res.status,200);assert.equal(records.length,1);
 const log=records[0];assert.equal(log.route,'/subscriptions/:id');assert.equal(log.status,200);assert.equal(log.category,'none');assert.equal(log.outcome,'success');assert.equal(log.requestId,res.headers['x-request-id']);assert.ok(Number.isInteger(log.durationMs));
 assert.doesNotMatch(JSON.stringify(records),/private-merchant|synthetic-private-token|user_id|email|amountMinor/);
});
test('authentication and database failures retain safe useful categories without raw errors',async()=>{
 for(const [error,category] of [[new ApiError(401,'UNAUTHORIZED','Sign in required'),'authentication'],[new ApiError(503,'AUTH_UNAVAILABLE','Sign in service unavailable'),'authentication'],[new ApiError(503,'DATABASE_UNAVAILABLE','Data service unavailable'),'database']]){
  const records=[];const app=createApp({authenticate:async()=>{throw error},monitor:record=>records.push(record)});
  const res=await authorize(request(app).get('/api/subscriptions'));
  assert.equal(res.status,error.status);assert.equal(records[0].category,category);assert.equal(records[0].code,error.code);assert.equal(records[0].requestId,res.headers['x-request-id']);
  assert.ok(!JSON.stringify(records).includes(error.message));
 }
});
test('malformed requests, rate limits and unknown URLs get finite operational labels',async()=>{
 const records=[];const app=createApp({authenticate,monitor:record=>records.push(record),rateLimitMax:2});
 await authorize(request(app).post('/api/subscriptions')).set('Content-Type','application/json').send('{broken');
 await request(app).get('/api/health');
 assert.equal((await request(app).get('/api/health')).status,429);
 assert.equal(records[0].category,'validation');assert.equal(records[0].code,'INVALID_JSON');assert.equal(records.at(-1).code,'RATE_LIMITED');
 const second=[];await authorize(request(createApp({authenticate,monitor:record=>second.push(record)})).get('/api/private-customer-name'));
 assert.equal(second[0].route,'unknown');assert.ok(!JSON.stringify(second).includes('private-customer-name'));
});
test('monitor events reject unapproved fields and replace hostile code/route values',()=>{
 const records=[];const monitor=createMonitor(record=>records.push(record));
 monitor({event:'api_request',route:'/private-account-secret',code:'secret-api-key',category:'database',status:503,durationMs:1.4,requestId:id,password:'raw-password',message:'full financial record',userId:'private-user',method:'CUSTOM-secret'});
 assert.deepEqual(Object.keys(records[0]).sort(),['category','code','durationMs','event','requestId','route','status','timestamp']);
 assert.equal(records[0].route,'unknown');assert.equal(records[0].code,'INTERNAL_ERROR');assert.doesNotMatch(JSON.stringify(records),/raw-password|private-user|full financial|secret-api-key|CUSTOM-secret/);
 monitor({event:'private arbitrary message'});assert.equal(records.length,1);
});
test('legacy logger shape stays stable and synchronous/asynchronous sinks cannot break API requests',async()=>{
 const rows=[];const app=createApp({authenticate,logger:row=>{rows.push(row);throw new Error('sink unavailable')},monitor:async()=>{throw new Error('remote sink unavailable')}});
 assert.equal((await request(app).get('/api/health')).status,200);
 assert.deepEqual(Object.keys(rows[0]).sort(),['durationMs','method','requestId','status']);
 safeLog(()=>{throw new Error('unavailable')},{});safeLog(async()=>{throw new Error('unavailable')},{});
 await new Promise(resolve=>setImmediate(resolve));
});
test('AI degraded fallbacks emit a correlated failure event while deterministic recommendations stay available',async()=>{
 const records=[];
 const assistant={provider:{enabled:true},buildContext:async()=>({recommendations:[],asOf:'2026-11-10'}),explain:async()=>{throw new ApiError(429,'AI_QUOTA','provider internal detail')}};
 const auth=async()=>({user:{id},repository:{all:async()=>[]}});
 const res=await authorize(request(createApp({authenticate:auth,assistant,monitor:row=>records.push(row)})).get('/api/ai/recommendations'));
 assert.equal(res.status,200);assert.equal(res.body.data.aiAvailable,false);
 const failure=records.find(row=>row.event==='ai_operation');assert.equal(failure.code,'AI_QUOTA');assert.equal(failure.category,'ai');assert.equal(failure.purpose,'recommendations');assert.equal(failure.requestId,res.headers['x-request-id']);
 assert.ok(!JSON.stringify(records).includes('provider internal detail'));
});
test('AI success monitoring emits no question, history, user identity, facts or response',async()=>{
 const records=[];const response={answer:'private-response'};
 const assistant={explain:async()=>({response})};
 const repository={aiConversation:async()=>({id}),aiTurn:async()=>[],aiMessages:async()=>({rows:[]}),aiAppendTurn:async()=>{repository.aiTurn=async()=>[{role:'assistant',structured_response:response}]}};
 const res=await authorize(request(createApp({authenticate:async()=>({user:{id:'private-owner'},repository}),assistant,monitor:row=>records.push(row)})).post('/api/ai/chat')).send({conversationId:id,message:'private financial question'});
 assert.equal(res.status,200);assert.equal(records.find(r=>r.event==='ai_operation').outcome,'success');
 assert.doesNotMatch(JSON.stringify(records),/private financial question|private-response|private-owner/);
});
test('route normalization never returns user-controlled resource IDs or query fragments',()=>{
 for(const [path,expected] of [['/api/v1/ai/conversations/private-conversation','/ai/conversations/:id'],['/api/notifications/private-id/read','/notifications/:id/read'],['/api/intelligence/suggestions/private-id/confirm','/intelligence/suggestions/:id/review'],['/api/ai/recommendations/private-id/dismiss','/ai/recommendations/:id/dismiss'],['/api/readiness','/readiness'],['/api/someone@example.com','unknown']])assert.equal(routeLabel(path),expected);
});
test('aborted HTTP connections record an operational abort instead of a successful response',async()=>{
 const records=[];let started,observed;const ready=new Promise(resolve=>{started=resolve});
 const aborted=new Promise(resolve=>{observed=resolve});
 const app=createApp({authenticate:async()=>{started();return new Promise(()=>{})},monitor:row=>{records.push(row);if(row.outcome==='aborted')observed()}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const {get}=await import('node:http');
 const pending=get({hostname:'127.0.0.1',port:server.address().port,path:'/api/subscriptions/private-record',headers:{Authorization:'Bearer synthetic-token'}});
 pending.on('error',()=>{});await ready;pending.destroy();
 let timer;try{await Promise.race([aborted,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Abort event not observed')),1000)})]);}finally{clearTimeout(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 assert.equal(records.length,1);assert.equal(records[0].outcome,'aborted');assert.equal(records[0].status,499);assert.equal(records[0].route,'/subscriptions/:id');
 assert.ok(!JSON.stringify(records).includes('private-record'));
});
