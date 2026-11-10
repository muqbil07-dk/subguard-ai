// Disposable local snapshot exercise; not hosted Supabase recovery validation.
// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
const a='61111111-1111-4111-8111-111111111111',b='62222222-2222-4222-8222-222222222222',turn='63333333-3333-4333-8333-333333333333'
const imports=[{merchant:'Recovery fixture',amountMinor:'79901',currency:'INR',date:'2026-11-10',category:'Tools'}]
let source,restored,snapshot,conversationId,assistantId
async function as(db,owner){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])}
async function service(db){await db.exec('reset role;set role service_role')}
beforeAll(async()=>{
 source=new PGlite()
 await source.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`)
 for(const file of ['202611090001_core.sql','202611090002_atomic_import.sql','202611090003_notification_delete.sql','202611100004_intelligence.sql','202611100005_ai_conversations.sql'])await source.exec(readFileSync(new URL(`../../../database/migrations/${file}`,import.meta.url),'utf8'))
 await source.query('insert into auth.users values($1,$2,$3),($4,$5,$6)',[a,'recovery-a@example.com','{"name":"Recovery A"}',b,'recovery-b@example.com','{"name":"Recovery B"}'])
 await as(source,a)
 await source.query(`insert into public.subscriptions(user_id,name,category,amount_minor,currency,frequency,next_renewal) values
 ($1,'Recovery plan','Tools',79901,'INR','Monthly','2026-12-10'),($1,'Recovery dollar plan','Tools',1299,'USD','Yearly','2027-01-01')`,[a])
 await source.query('select public.import_transactions($1::jsonb,$2)',[JSON.stringify(imports),'recovery-import'])
 conversationId=(await source.query('insert into public.ai_conversations(user_id,title) values($1,$2) returning id',[a,'Recovery questions'])).rows[0].id
 await service(source)
 assistantId=(await source.query('select public.append_ai_turn($1,$2,$3,$4::jsonb,$5) as id',[a,conversationId,'Review the fixture',JSON.stringify({answer:'Review the recorded subscription evidence.'}),turn])).rows[0].id
 await source.query('select public.reserve_ai_request($1)',[a])
 await source.exec('reset role')
 snapshot=await source.dumpDataDir('gzip')
 // Export is independent of subsequent changes in the source database.
 await as(source,a)
 await source.query('update public.ai_conversations set title=$1 where id=$2',['After snapshot',conversationId])
 restored=new PGlite({loadDataDir:snapshot})
 await restored.waitReady
},30000)
afterAll(async()=>{await restored?.close();await source?.close()})
it('reopens a separate snapshot with identity mappings and exact currency amounts',async()=>{
 expect(snapshot.size).toBeGreaterThan(0);expect(restored).not.toBe(source)
 await as(restored,a)
 expect((await restored.query('select id,name from public.profiles')).rows).toEqual([{id:a,name:'Recovery A'}])
 expect((await restored.query('select currency,sum(amount_minor)::text as minor from public.subscriptions group by currency order by currency')).rows).toEqual([{currency:'INR',minor:'79901'},{currency:'USD',minor:'1299'}])
 expect((await restored.query('select amount_minor::text as minor from public.transactions')).rows).toEqual([{minor:'79901'}])
 expect((await restored.query('select title from public.ai_conversations where id=$1',[conversationId])).rows[0].title).toBe('Recovery questions')
})
it('retains RLS ownership, private-table denial and anonymous denial after recovery',async()=>{
 await as(restored,b)
 for(const table of ['subscriptions','transactions','ai_conversations','ai_messages'])expect((await restored.query(`select * from public.${table}`)).rows).toHaveLength(0)
 await restored.query('update public.ai_conversations set title=$1 where id=$2',['Foreign update',conversationId])
 await restored.query('delete from public.ai_conversations where id=$1',[conversationId])
 await expect(restored.query('select * from private.ai_request_usage')).rejects.toThrow()
 await as(restored,a)
 expect((await restored.query('select title from public.ai_conversations where id=$1',[conversationId])).rows[0].title).toBe('Recovery questions')
 await expect(restored.query('update public.subscriptions set user_id=$1',[b])).rejects.toThrow()
 await restored.exec('reset role;set role anon')
 await expect(restored.query('select * from public.transactions')).rejects.toThrow()
})
it('retains RPC privileges, canonical chat and import idempotency after recovery',async()=>{
 await as(restored,a)
 await expect(restored.query('select public.append_ai_turn($1,$2,$3,$4::jsonb,$5)',[a,conversationId,'Review the fixture',JSON.stringify({answer:'Forged browser answer'}),turn])).rejects.toThrow()
 expect((await restored.query('select public.import_transactions($1::jsonb,$2) as inserted',[JSON.stringify(imports),'recovery-import'])).rows[0].inserted).toBe(0)
 await service(restored)
 const replay=await restored.query('select public.append_ai_turn($1,$2,$3,$4::jsonb,$5) as id',[a,conversationId,'Review the fixture',JSON.stringify({answer:'Changed answer must not replace snapshot.'}),turn])
 expect(replay.rows[0].id).toBe(assistantId)
 await as(restored,a)
 expect((await restored.query('select role,content from public.ai_messages order by sequence')).rows).toEqual([{role:'user',content:'Review the fixture'},{role:'assistant',content:'Review the recorded subscription evidence.'}])
 expect((await restored.query('select * from public.transactions')).rows).toHaveLength(1)
})
it('retains quota state, constraints and message-sequence allocation after recovery',async()=>{
 await restored.exec('reset role')
 expect((await restored.query('select day_count from private.ai_request_usage where user_id=$1',[a])).rows[0].day_count).toBe(1)
 await service(restored)
 await restored.query('select public.reserve_ai_request($1)',[a])
 await restored.query('select public.append_ai_turn($1,$2,$3,$4::jsonb)',[a,conversationId,'Another fixture question',JSON.stringify({answer:'Review the same authorized evidence.'})])
 await restored.exec('reset role')
 expect((await restored.query('select day_count from private.ai_request_usage where user_id=$1',[a])).rows[0].day_count).toBe(2)
 await as(restored,a)
 const rows=(await restored.query('select sequence::text from public.ai_messages order by sequence')).rows
 expect(rows).toHaveLength(4);expect(rows.every((r,i)=>i===0||BigInt(r.sequence)>BigInt(rows[i-1].sequence))).toBe(true)
 await expect(restored.query('update public.subscriptions set amount_minor=-1')).rejects.toThrow()
 await expect(restored.query("update public.subscriptions set currency='INVALID'")).rejects.toThrow()
})
