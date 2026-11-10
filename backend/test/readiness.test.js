import {test} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {createRepository} from '../src/services/repository.js';
import {loadConfig} from '../src/config/index.js';
const valid={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic-public',FRONTEND_ORIGIN:'https://staging.example.com'};
test('staging and production configuration require HTTPS without changing local development',()=>{
 for(const NODE_ENV of ['staging','production']){
  assert.equal(loadConfig({...valid,NODE_ENV}).NODE_ENV,NODE_ENV);
  assert.throws(()=>loadConfig({...valid,NODE_ENV,FRONTEND_ORIGIN:'http://staging.example.com'}));
  assert.throws(()=>loadConfig({...valid,NODE_ENV,SUPABASE_URL:'http://localhost:54321'}));
 }
 assert.equal(loadConfig({...valid,SUPABASE_URL:'http://localhost:54321',FRONTEND_ORIGIN:'http://localhost:5173'}).NODE_ENV,'development');
 for(const SUPABASE_URL of ['ftp://localhost','https://example.supabase.co/rest/v1','https://user:password@example.supabase.co','https://example.supabase.co?credential=synthetic','https://example.supabase.co#fragment'])assert.throws(()=>loadConfig({...valid,SUPABASE_URL}));
});
test('readiness is authenticated, owner-scoped, bounded and returns no record details',async()=>{
 const calls=[];const q={};for(const method of ['select','eq','limit'])q[method]=(...args)=>{calls.push([method,...args]);return q};q.then=resolve=>resolve({data:[{id:'private-owner-record'}]});
 const repo=createRepository({from:table=>{assert.equal(table,'profiles');return q}},'verified-owner');
 const app=createApp({authenticate:async()=>({user:{id:'verified-owner'},repository:repo})});
 assert.equal((await request(app).get('/api/readiness')).status,401);
 assert.equal((await request(app).get('/api/readiness?user_id=other').set('Authorization','Bearer synthetic')).status,400);
 const r=await request(app).get('/api/v1/readiness').set('Authorization','Bearer synthetic');
 assert.equal(r.status,200);assert.deepEqual(r.body.data,{status:'ready',database:'reachable'});
 assert.deepEqual(calls,[['select','id'],['eq','user_id','verified-owner'],['limit',1]]);
 assert.ok(!JSON.stringify(r.body).includes('private-owner-record'));
});
test('readiness detects missing profile/schema/query failure while liveness remains independent',async()=>{
 for(const result of [{data:[]},{error:{code:'42P01',message:'private database details'}}]){
  const q={select(){return this},eq(){return this},limit(){return this},then(resolve){resolve(result)}};
  const repo=createRepository({from:()=>q},'owner');const app=createApp({authenticate:async()=>({user:{id:'owner'},repository:repo})});
  const r=await request(app).get('/api/readiness').set('Authorization','Bearer synthetic');assert.equal(r.status,503);assert.ok(!JSON.stringify(r.body).includes('private database details'));
  assert.equal((await request(app).get('/api/health')).status,200);
 }
});
