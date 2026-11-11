// Real PostgreSQL semantics in PGlite; Auth schema is a test harness, not hosted Supabase.
// @vitest-environment node
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
let db
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
beforeAll(async()=>{db=new PGlite();await db.exec(`create role anon;create role service_role;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`);for(const file of ['202611090001_core.sql','202611090002_atomic_import.sql','202611090003_notification_delete.sql','202611100004_intelligence.sql'])await db.exec(readFileSync(new URL(`../../../database/migrations/${file}`,import.meta.url),'utf8'));await db.query('insert into auth.users values ($1,$2,$3),($4,$5,$6)',[a,'a@example.com','{"name":"Alice"}',b,'b@example.com','{"name":"Bob"}'])},30000)
afterAll(async()=>db?.close())
async function as(id){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`)}
it('creates profiles/preferences and enforces cross-user read/write isolation',async()=>{await as(a);expect((await db.query('select * from public.profiles')).rows).toHaveLength(1);await db.exec(`insert into public.subscriptions(user_id,name,category,amount_minor,currency,frequency,next_renewal) values('${a}','Netflix','Entertainment',64900,'INR','Monthly','2026-12-12')`);await expect(db.exec(`insert into public.subscriptions(user_id,name,category,amount_minor,currency,frequency,next_renewal) values('${b}','Forged','Other',100,'INR','Monthly','2026-12-12')`)).rejects.toThrow();await expect(db.exec(`update public.subscriptions set user_id='${b}'`)).rejects.toThrow();await as(b);expect((await db.query('select * from public.subscriptions')).rows).toHaveLength(0);await db.exec("update public.subscriptions set name='Attack';delete from public.subscriptions");await as(a);expect((await db.query('select name from public.subscriptions')).rows[0].name).toBe('Netflix')})
it('rejects invalid money/currency and generated-field/private-table access',async()=>{await as(a);await expect(db.exec("update public.subscriptions set amount_minor=-1")).rejects.toThrow();await expect(db.exec("update public.subscriptions set currency='BAD'")).rejects.toThrow();await expect(db.exec("update public.subscriptions set currency=null")).rejects.toThrow();await expect(db.exec("update public.subscriptions set amount_minor='1.1'")).rejects.toThrow();await expect(db.exec("update public.subscriptions set next_renewal='2026-02-30'")).rejects.toThrow();await expect(db.exec("update public.profiles set email='forged'")).rejects.toThrow();await expect(db.exec("select * from private.paypal_webhook_events")).rejects.toThrow();await expect(db.exec(`insert into public.ai_insights(user_id,title,description,provenance) values('${a}','Fake','Fake','verified_provider')`)).rejects.toThrow()})
it('imports atomically, rejects changed replay and keeps users separate',async()=>{await as(a);const rows=[{merchant:'Example',amountMinor:'100',currency:'INR',date:'2026-11-01',category:'Other'}];await db.query('select public.import_transactions($1::jsonb,$2)',[JSON.stringify(rows),'batch']);await db.query('select public.import_transactions($1::jsonb,$2)',[JSON.stringify(rows),'batch']);expect((await db.query('select * from public.transactions')).rows).toHaveLength(1);await expect(db.query('select public.import_transactions($1::jsonb,$2)',[JSON.stringify([{...rows[0],amountMinor:'200'}]),'batch'])).rejects.toThrow();await expect(db.query('select public.import_transactions($1::jsonb,$2)',[JSON.stringify([...rows,{...rows[0],currency:'BAD'}]),'invalid'])).rejects.toThrow();expect((await db.query('select * from public.transactions')).rows).toHaveLength(1);await as(b);expect((await db.query('select * from public.transactions')).rows).toHaveLength(0);await db.exec('update public.transactions set amount_minor=999;delete from public.transactions');await as(a);expect((await db.query('select amount_minor::text from public.transactions')).rows[0].amount_minor).toBe('100');await expect(db.query('update public.transactions set user_id=$1',[b])).rejects.toThrow()})
it('denies anonymous data access and supports owner update/delete',async()=>{await db.exec('reset role;set role anon');await expect(db.query('select * from public.profiles')).rejects.toThrow();await as(a);await db.exec("update public.subscriptions set name='Updated' where name='Netflix'");expect((await db.query('select name from public.subscriptions')).rows[0].name).toBe('Updated');await db.exec('delete from public.subscriptions');expect((await db.query('select * from public.subscriptions')).rows).toHaveLength(0);await db.exec("update public.transactions set status='Pending'");expect((await db.query('select status from public.transactions')).rows[0].status).toBe('Pending');await db.exec('delete from public.transactions');expect((await db.query('select * from public.transactions')).rows).toHaveLength(0)})

it('notification deletion policy denies other owners and allows own deletion',async()=>{await db.exec('reset role');await db.query('insert into public.notifications(user_id,title,body,delivery_key) values($1,$2,$3,$4)',[a,'Test fixture','Deterministic policy test only','rls-delete']);await as(b);await db.exec('delete from public.notifications');await as(a);expect((await db.query('select * from public.notifications')).rows).toHaveLength(1);await db.exec('delete from public.notifications');expect((await db.query('select * from public.notifications')).rows).toHaveLength(0)})
it('persists idempotent evidence and atomically confirms only owned suggestions',async()=>{await db.exec('reset role');const payload={ruleVersion:'test',suggestions:[{dedupe_key:'merchant',merchant:'Netflix',identity:'netflix',currency:'INR',amountMinor:'64900',frequency:'Monthly',confidence:95,state:'Suggested',prediction:{nextPaymentDate:'2026-12-10'}}],findings:[{dedupe_key:'alert',type:'price_increase',currency:'INR'}]};await db.query('select public.persist_intelligence($1,$2::jsonb)',[a,JSON.stringify(payload)]);await db.query('select public.persist_intelligence($1,$2::jsonb)',[a,JSON.stringify(payload)]);await as(a);const suggestions=(await db.query('select * from public.recurring_detection_suggestions')).rows;expect(suggestions).toHaveLength(1);expect((await db.query('select * from public.transaction_anomalies')).rows).toHaveLength(1);await expect(db.exec("update public.recurring_detection_suggestions set confidence=100")).rejects.toThrow();await expect(db.query('select public.review_recurring($1,$2,$3)',[a,suggestions[0].id,'confirm'])).rejects.toThrow();await as(b);expect((await db.query('select * from public.recurring_detection_suggestions')).rows).toHaveLength(0);await db.exec('reset role;set role service_role');await expect(db.query('select public.review_recurring($1,$2,$3)',[b,suggestions[0].id,'confirm'])).rejects.toThrow();const first=await db.query('select public.review_recurring($1,$2,$3)',[a,suggestions[0].id,'confirm']);const second=await db.query('select public.review_recurring($1,$2,$3)',[a,suggestions[0].id,'confirm']);expect(first.rows).toEqual(second.rows);await db.query('select public.persist_intelligence($1,$2::jsonb)',[a,JSON.stringify(payload)]);await as(a);expect((await db.query('select state from public.recurring_detection_suggestions')).rows[0].state).toBe('Confirmed')})
it('rejected suggestions survive reruns and confirmed history does not block deleting tracking',async()=>{await db.exec('reset role');const input={ruleVersion:'test',suggestions:[{dedupe_key:'reject-history',merchant:'Other',identity:'other',currency:'INR',amountMinor:'100',frequency:'Monthly',confidence:75,state:'Suggested',prediction:{nextPaymentDate:'2026-12-20'}}],findings:[]};await db.query('select public.persist_intelligence($1,$2::jsonb)',[a,JSON.stringify(input)]);const record=(await db.query("select id from public.recurring_detection_suggestions where dedupe_key='reject-history'")).rows[0];await db.query('select public.review_recurring($1,$2,$3)',[a,record.id,'reject']);await db.query('select public.persist_intelligence($1,$2::jsonb)',[a,JSON.stringify(input)]);await as(a);expect((await db.query("select state from public.recurring_detection_suggestions where dedupe_key='reject-history'")).rows[0].state).toBe('Rejected');const confirmed=(await db.query("select subscription_id,id from public.recurring_detection_suggestions where state='Confirmed'")).rows[0];await db.query('delete from public.subscriptions where id=$1',[confirmed.subscription_id]);expect((await db.query('select subscription_id from public.recurring_detection_suggestions where id=$1',[confirmed.id])).rows[0].subscription_id).toBeNull();await db.exec('reset role;set role service_role');await expect(db.query('select public.review_recurring($1,$2,$3)',[a,confirmed.id,'confirm'])).rejects.toThrow()})

describe('review_recurring SQL decision validation',()=>{
 const review=(owner,id,decision)=>db.query('select public.review_recurring($1,$2,$3) as subscription_id',[owner,id,decision])
 async function fixture(label){
  await db.exec('reset role')
  const result=await db.query(`insert into public.recurring_detection_suggestions
   (user_id,dedupe_key,merchant,identity,currency,amount_minor,frequency,confidence,state,payload,rule_version)
   values($1,$2,'Decision fixture','decision fixture','INR',101,'Monthly',90,'Suggested',$3::jsonb,'decision-regression') returning id`,
  [a,`decision-regression-${label}`,JSON.stringify({prediction:{nextPaymentDate:'2026-12-20'}})])
  return result.rows[0].id
 }
 async function snapshot(id){
  await db.exec('reset role')
  return {
   subscriptions:(await db.query('select * from public.subscriptions order by id')).rows,
   suggestion:(await db.query('select * from public.recurring_detection_suggestions where id=$1',[id])).rows[0],
  }
 }
 it.each([
  ['NULL',null],
  ['empty',''],
  ['unknown','approve'],
  ['uppercase confirm','CONFIRM'],
  ['uppercase reject','REJECT'],
 ])('rejects %s decisions without creating subscriptions or changing the suggestion',async(label,decision)=>{
  const id=await fixture(label),before=await snapshot(id)
  expect(before.suggestion.state).toBe('Suggested')
  expect(before.suggestion.subscription_id).toBeNull()
  await db.exec('set role service_role')
  await expect(review(a,id,decision)).rejects.toMatchObject({code:'P0001',message:'Invalid decision'})
  expect(await snapshot(id)).toEqual(before)
 })
 it('preserves valid service-role confirmation and idempotent subscription linkage',async()=>{
  const id=await fixture('valid confirm'),before=await snapshot(id)
  await db.exec('set role service_role')
  const first=await review(a,id,'confirm')
  const linked=first.rows[0].subscription_id
  expect(linked).toEqual(expect.any(String))
  expect((await review(a,id,'confirm')).rows[0].subscription_id).toBe(linked)
  const after=await snapshot(id)
  expect(after.subscriptions).toHaveLength(before.subscriptions.length+1)
  expect(after.subscriptions.find(row=>row.id===linked)).toMatchObject({user_id:a,name:'Decision fixture',amount_minor:101,status:'Active'})
  expect(after.suggestion).toMatchObject({state:'Confirmed',subscription_id:linked})
 })
 it('preserves valid rejection without creating or linking a subscription',async()=>{
  const id=await fixture('valid reject'),before=await snapshot(id)
  await db.exec('set role service_role')
  expect((await review(a,id,'reject')).rows[0].subscription_id).toBeNull()
  const after=await snapshot(id)
  expect(after.subscriptions).toEqual(before.subscriptions)
  expect(after.suggestion).toMatchObject({state:'Rejected',subscription_id:null})
 })
 it('rejects another owner for confirm and reject without changing records',async()=>{
  const id=await fixture('foreign owner'),before=await snapshot(id)
  await db.exec('set role service_role')
  for(const decision of ['confirm','reject'])await expect(review(b,id,decision)).rejects.toMatchObject({code:'P0002',message:'Suggestion unavailable'})
  expect(await snapshot(id)).toEqual(before)
 })
 it.each(['authenticated','anon'])('keeps %s unable to execute the review RPC',async role=>{
  const id=await fixture(`denied ${role}`),before=await snapshot(id)
  if(role==='authenticated')await as(a)
  else await db.exec('set role anon')
  for(const decision of ['confirm','reject',null])await expect(review(a,id,decision)).rejects.toMatchObject({code:'42501'})
  expect(await snapshot(id)).toEqual(before)
 })
})
