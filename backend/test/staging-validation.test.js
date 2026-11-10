import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runGeminiValidation, runSupabaseValidation, supabaseStagingConfig, validationMain } from '../scripts/staging-validation.js';
import { narratives } from '../src/services/ai/narratives.js';
const config={ALLOW_LIVE_VALIDATION:'true',DEPLOYMENT_ENVIRONMENT:'staging',STAGING_TEST_ACCOUNTS_CONFIRMED:'true',STAGING_PROJECT_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key',STAGING_TEST_USER_A_EMAIL:'fixture-a@example.com',STAGING_TEST_USER_A_PASSWORD:'synthetic-password-a',STAGING_TEST_USER_B_EMAIL:'fixture-b@example.com',STAGING_TEST_USER_B_PASSWORD:'synthetic-password-b'};
const gemini={ALLOW_LIVE_VALIDATION:'true',GEMINI_API_KEY:'synthetic-only-key',GEMINI_MODEL:'test-configured-model'};
const modelOutput=context=>JSON.stringify({answer:narratives[6],summary:narratives[6],keyFacts:context.facts.map(f=>f.id),evidence:context.facts.map(f=>f.id),recommendations:context.recommendations.slice(0,5).map(r=>({id:r.id,explanation:narratives[1]})),warnings:[],confidence:'grounded'});
test('all live entry points refuse credentials without explicit opt-in before constructing clients',async()=>{
 let calls=0;const factory=()=>{calls++;throw new Error('No network allowed')};
 await assert.rejects(runGeminiValidation({...gemini,ALLOW_LIVE_VALIDATION:undefined},{providerFactory:factory}),{code:'LIVE_VALIDATION_NOT_AUTHORIZED'});
 await assert.rejects(runSupabaseValidation({...config,ALLOW_LIVE_VALIDATION:'false'},{clientFactory:factory}),{code:'LIVE_VALIDATION_NOT_AUTHORIZED'});
 assert.equal(calls,0);
});
for(const override of [{DEPLOYMENT_ENVIRONMENT:'production'},{STAGING_TEST_ACCOUNTS_CONFIRMED:'false'},{STAGING_PROJECT_REF:'invalid'},{SUPABASE_URL:'https://other-project.supabase.co'},{SUPABASE_URL:'http://abcdefghijklmnopqrst.supabase.co'},{SUPABASE_SERVICE_ROLE_KEY:''},{STAGING_TEST_USER_A_PASSWORD:''},{STAGING_TEST_USER_B_EMAIL:'FIXTURE-A@example.com'}])test(`hosted staging guard rejects unsafe/missing configuration ${Object.keys(override)[0]}`,()=>assert.throws(()=>supabaseStagingConfig({...config,...override})));
test('three synthetic Gemini scenarios retain deterministic facts and use no arbitrary data access',async()=>{
 let calls=0,verified=0;
 const result=await runGeminiValidation(gemini,{providerFactory:()=>({async verify(){verified++},async generate({context}){calls++;assert.ok(!JSON.stringify(context.model).match(/synthetic-inr|synthetic-usd|Synthetic streaming fixture/));return {text:modelOutput(context),allowedFactIds:context.facts.map(f=>f.id)}}})});
 assert.equal(calls,3);assert.equal(verified,1);assert.equal(result.maximumGenerationRequests,6);assert.equal(result.scenarios.length,3);assert.ok(result.scenarios.every(r=>r.status==='passed'));
});
test('live financial discrepancy is a failure instead of weakening citation requirements',async()=>{
 await assert.rejects(runGeminiValidation(gemini,{providerFactory:()=>({async verify(){},async generate({context}){const body=JSON.parse(modelOutput(context));body.keyFacts=[];body.evidence=[context.facts.find(f=>f.currency==='INR').id];body.recommendations=[];return {text:JSON.stringify(body),allowedFactIds:context.facts.map(f=>f.id)}}})}),{code:'LIVE_EVIDENCE_DISCREPANCY'});
});
test('invalid Gemini JSON and unsupported numeric prose remain rejected in live validator',async()=>{
 for(const text of ['{broken',JSON.stringify({answer:'Your income is INR 50000.'})])await assert.rejects(runGeminiValidation(gemini,{providerFactory:()=>({async verify(){},async generate({context}){return {text,allowedFactIds:context.facts.map(f=>f.id)}}})}),{code:'AI_INVALID_RESPONSE'});
});
function isolatedSdk({breakIsolation=false,failAppend=false,loginError=false,sameOwner=false,constraintCode='23514',sessionError=false,refreshError=false}={}) {
 const records={profiles:new Map([['a',{id:'a',user_id:'a'}],['b',{id:'b',user_id:'b'}]]),subscriptions:new Map(),transactions:new Map(),ai_conversations:new Map(),ai_messages:new Map()};
 const untouchedId=randomUUID();records.subscriptions.set(untouchedId,{id:untouchedId,user_id:'a',name:'Unrelated synthetic record'});
 const calls=[];let clients=0;
 const missing=()=>Object.assign(new Error('Missing'),{status:404});
 const repository=owner=>({
  async create(table,input){const row={id:randomUUID(),user_id:owner,...input};records[table].set(row.id,row);calls.push(['create',table,row.id]);return row},
  async get(table,id){const r=records[table].get(id);if(!r||r.user_id!==owner)throw missing();return r},
  async update(table,id,input){const row=await this.get(table,id);Object.assign(row,input);return row},
  async delete(table,id){await this.get(table,id);records[table].delete(id);calls.push(['delete',table,id])},
  async aiCreateConversation(title){return this.create('ai_conversations',{title})},
  async aiConversation(id){return this.get('ai_conversations',id)},
  async aiAppendTurn(id,message,response,key){if(failAppend)throw new Error('Synthetic RPC failure');await this.aiConversation(id);if(!records.ai_messages.has(id))records.ai_messages.set(id,[{role:'user',content:message,turn_id:key},{role:'assistant',structured_response:response,turn_id:key}])},
  async aiMessages(id){await this.aiConversation(id);return {rows:records.ai_messages.get(id)||[]}},
  async aiDeleteConversation(id){await this.delete('ai_conversations',id);records.ai_messages.delete(id)},
 });
 const factory=()=>{
  const owner=sameOwner?'a':clients++===0?'a':'b';let session=null;
  return {
   auth:{async signInWithPassword(){calls.push(['login',owner]);if(loginError)return {error:{message:'Never print this synthetic password'}};session={access_token:owner};return {data:{session}}},async getSession(){return {data:{session},...(sessionError?{error:{code:'synthetic-session-error'}}:{})}},async refreshSession(){calls.push(['refresh',owner]);return {data:{session},...(refreshError?{error:{code:'synthetic-refresh-error'}}:{})}},async signOut(options){assert.equal(options.scope,'local');calls.push(['logout',owner]);session=null;return {data:{}}}},
   from(table){let method='select',input;const query={select(){return this},update(value){method='update';input=value;return this},delete(){method='delete';return this},async eq(column,id){
    if(table==='ai_messages')return {data:[]};
    const row=records[table].get(id);const visible=row&&(row.user_id===owner||breakIsolation);
    if(!visible)return {data:[]};
    if(method==='update'&&input.amount_minor===-1)return {error:{code:constraintCode}};
    if(method==='update')Object.assign(row,input);
    if(method==='delete')records[table].delete(id);
    return {data:[{id:row.id}]};
   }};return query},
  };
 };
 return {records,calls,untouchedId,dependencies:{clientFactory:factory,authenticateFactory:()=>async token=>({user:{id:token},repository:repository(token)})}};
}
test('hosted validator exercises real adapter workflow with two mocked SDK principals and scoped cleanup',async()=>{
 const fixture=isolatedSdk();const result=await runSupabaseValidation(config,fixture.dependencies);
 assert.equal(result.status,'passed');assert.equal(result.cleanup,'completed');assert.equal(result.dedicatedAccounts,2);
 assert.equal(fixture.records.subscriptions.size,1);assert.ok(fixture.records.subscriptions.has(fixture.untouchedId));
 for(const table of ['transactions','ai_conversations','ai_messages'])assert.equal(fixture.records[table].size,0);
 assert.equal(fixture.calls.filter(c=>c[0]==='login').length,2);assert.equal(fixture.calls.filter(c=>c[0]==='refresh').length,2);assert.equal(fixture.calls.filter(c=>c[0]==='logout').length,2);
 assert.ok(fixture.calls.filter(c=>c[0]==='delete').every(c=>c[2]!==fixture.untouchedId));
});
test('direct RLS exposure is detected and cleanup still targets script-created records only',async()=>{
 const fixture=isolatedSdk({breakIsolation:true});await assert.rejects(runSupabaseValidation(config,fixture.dependencies),{code:'STAGING_ISOLATION_FAILED'});
 assert.equal(fixture.records.subscriptions.size,1);assert.ok(fixture.records.subscriptions.has(fixture.untouchedId));assert.equal(fixture.records.transactions.size,0);assert.equal(fixture.records.ai_conversations.size,0);
});
test('failed conversation persistence and failed login cannot leave script-created financial fixtures',async()=>{
 for(const options of [{failAppend:true},{loginError:true},{sameOwner:true}]){
  const fixture=isolatedSdk(options);await assert.rejects(runSupabaseValidation(config,fixture.dependencies));assert.equal(fixture.records.subscriptions.size,1);assert.ok(fixture.records.subscriptions.has(fixture.untouchedId));assert.equal(fixture.records.transactions.size,0);assert.equal(fixture.records.ai_conversations.size,0);
 }
});
test('CLI failure output exposes fixed codes only, never provider message or key',async t=>{
 const messages=[];t.mock.method(console,'error',message=>messages.push(message));
 const exit=await validationMain('gemini',gemini,{providerFactory:()=>({async verify(){throw Object.assign(new Error('synthetic-only-key private details'),{code:'synthetic-private-code'})}})});
 assert.equal(exit,1);assert.deepEqual(JSON.parse(messages[0]),{service:'gemini',status:'failed_or_blocked',code:'STAGING_VALIDATION_FAILED'});
 const nullExit=await validationMain('gemini',gemini,{providerFactory:()=>({async verify(){throw null}})});assert.equal(nullExit,1);assert.equal(JSON.parse(messages[1]).code,'STAGING_VALIDATION_FAILED');
});

test('permission and transport errors cannot masquerade as a database constraint rejection',async()=>{for(const constraintCode of ['42501','08006']){const fixture=isolatedSdk({constraintCode});await assert.rejects(runSupabaseValidation(config,fixture.dependencies),{code:'STAGING_CONSTRAINT_FAILED'});assert.equal(fixture.records.subscriptions.size,1)}});
test('SDK session and refresh errors are failures even when data is present',async()=>{for(const options of [{sessionError:true},{refreshError:true}]){const fixture=isolatedSdk(options);await assert.rejects(runSupabaseValidation(config,fixture.dependencies));assert.equal(fixture.records.subscriptions.size,1)}});
test('already-cancelled validation deadlines prevent provider/SDK construction',async()=>{let calls=0;const factory=()=>{calls++;throw new Error('No network')};const deadlineSignal=AbortSignal.abort();await assert.rejects(runGeminiValidation(gemini,{providerFactory:factory,deadlineSignal}),{code:'STAGING_TIMEOUT'});await assert.rejects(runSupabaseValidation(config,{clientFactory:factory,deadlineSignal}),{code:'STAGING_TIMEOUT'});assert.equal(calls,0)});
