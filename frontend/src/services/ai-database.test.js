// PostgreSQL/RLS integration checks. Auth roles are test stubs, not hosted Supabase.
// @vitest-environment node
import {PGlite} from '@electric-sql/pglite'
import {readFileSync} from 'node:fs'
import {afterAll,beforeAll,expect,it} from 'vitest'

const a='11111111-1111-4111-8111-111111111111'
const b='22222222-2222-4222-8222-222222222222'
let db

beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;`)
  for(const file of ['202611090001_core.sql','202611090002_atomic_import.sql','202611090003_notification_delete.sql','202611100004_intelligence.sql','202611100005_ai_conversations.sql']) {
    await db.exec(readFileSync(new URL(`../../../database/migrations/${file}`,import.meta.url),'utf8'))
  }
  await db.query('insert into auth.users values ($1,$2,$3),($4,$5,$6)',[a,'alice@example.com','{"name":"Alice"}',b,'bob@example.com','{"name":"Bob"}'])
},30000)
afterAll(async()=>db?.close())

async function as(id){
  await db.exec('reset role;set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
}
async function service(){await db.exec('reset role;set role service_role')}
async function conversation(owner,title='Subscription questions'){
  await as(owner)
  return (await db.query('insert into public.ai_conversations(user_id,title) values($1,$2) returning id',[owner,title])).rows[0].id
}
async function append(owner,id,text='Explain my renewals',answer={answer:'Review your upcoming renewals.'}){
  return db.query('select public.append_ai_turn($1,$2,$3,$4::jsonb) as id',[owner,id,text,JSON.stringify(answer)])
}

it('replays all five migrations and limits conversation CRUD to its owner and title column',async()=>{
  const id=await conversation(a)
  await expect(db.query('insert into public.ai_conversations(user_id) values($1)',[b])).rejects.toThrow()
  await expect(db.query('update public.ai_conversations set user_id=$1 where id=$2',[b,id])).rejects.toThrow()
  await expect(db.query('update public.ai_conversations set created_at=now() where id=$1',[id])).rejects.toThrow()
  await db.query('update public.ai_conversations set title=$1 where id=$2',['Renewal questions',id])
  await expect(db.query('update public.ai_conversations set title=$1 where id=$2',['x'.repeat(101),id])).rejects.toThrow()
  await as(b)
  expect((await db.query('select * from public.ai_conversations where id=$1',[id])).rows).toHaveLength(0)
  await db.query('update public.ai_conversations set title=$1 where id=$2',['Stolen',id])
  await db.query('delete from public.ai_conversations where id=$1',[id])
  await as(a)
  expect((await db.query('select title from public.ai_conversations where id=$1',[id])).rows[0].title).toBe('Renewal questions')
})

it('denies browser message writes and cross-owner composite references',async()=>{
  const id=await conversation(a,'Message ownership')
  for(const role of ['user','assistant']) {
    await expect(db.query('insert into public.ai_messages(user_id,conversation_id,role,content) values($1,$2,$3,$4)',[a,id,role,'Forged'])).rejects.toThrow()
  }
  await db.exec('reset role')
  await expect(db.query('insert into public.ai_messages(user_id,conversation_id,turn_id,role,content) values($1,$2,gen_random_uuid(),$3,$4)',[b,id,'assistant','Wrong owner'])).rejects.toMatchObject({code:'23503'})
  await service()
  await append(a,id)
  await as(a)
  await expect(db.query('update public.ai_messages set content=$1 where conversation_id=$2',['Forged',id])).rejects.toThrow()
  await expect(db.query('delete from public.ai_messages where conversation_id=$1',[id])).rejects.toThrow()
  await as(b)
  expect((await db.query('select * from public.ai_messages where conversation_id=$1',[id])).rows).toHaveLength(0)
})

it('restricts append/quota RPCs to service_role and validates conversation ownership',async()=>{
  const id=await conversation(a,'RPC privileges')
  await expect(append(a,id)).rejects.toThrow()
  await expect(db.query('select public.reserve_ai_request($1)',[a])).rejects.toThrow()
  await db.exec('reset role;set role anon')
  await expect(append(a,id)).rejects.toThrow()
  await expect(db.query('select public.reserve_ai_request($1)',[a])).rejects.toThrow()
  await expect(db.query('select * from public.ai_conversations')).rejects.toThrow()
  await service()
  await expect(append(b,id)).rejects.toThrow('Conversation unavailable')
  await as(a)
  expect((await db.query('select * from public.ai_messages where conversation_id=$1',[id])).rows).toHaveLength(0)
})

it('appends sanitized atomic pairs with stable sequence ordering and structured answers',async()=>{
  const id=await conversation(a,'Ordered turns')
  await service()
  const result=await append(a,id,'  Explain\nrenewals\t ',{answer:'Calendar dates are estimates.',confidence:80})
  await append(a,id,'Another question',{answer:'Check the source data.'})
  await as(a)
  const rows=(await db.query('select id,role,content,structured_response,sequence::text from public.ai_messages where conversation_id=$1 order by sequence',[id])).rows
  expect(rows.map(row=>row.role)).toEqual(['user','assistant','user','assistant'])
  expect(rows[0].content).toBe('Explainrenewals')
  expect(rows[0].structured_response).toBeNull()
  expect(rows[1].id).toBe(result.rows[0].id)
  expect(rows[1].structured_response).toEqual({answer:'Calendar dates are estimates.',confidence:80})
  expect(rows.every((row,index)=>index===0||BigInt(row.sequence)>BigInt(rows[index-1].sequence))).toBe(true)
})

it('replays a supplied turn key without duplicate messages and rejects changed input',async()=>{
  const id=await conversation(a,'Idempotent turn')
  const requestKey='33333333-3333-4333-8333-333333333333'
  await service()
  const call=(text,answer)=>db.query('select public.append_ai_turn($1,$2,$3,$4::jsonb,$5) as id',[a,id,text,JSON.stringify({answer}),requestKey])
  const first=await call('Why did my bill change?','Review the billed amounts.')
  const replay=await call('Why did my bill change?','A changed response must not overwrite history.')
  expect(replay.rows[0].id).toBe(first.rows[0].id)
  await expect(call('A different question','Another answer')).rejects.toMatchObject({code:'23505',message:'AI request key reused with different input'})
  await as(a)
  const rows=(await db.query('select role,content,turn_id from public.ai_messages where conversation_id=$1 order by sequence',[id])).rows
  expect(rows).toEqual([
    {role:'user',content:'Why did my bill change?',turn_id:requestKey},
    {role:'assistant',content:'Review the billed amounts.',turn_id:requestKey},
  ])
})

it('rolls back the user message if inserting the assistant fails',async()=>{
  const id=await conversation(a,'Atomic rollback')
  await db.exec(`reset role;
    create function public.test_reject_ai_answer() returns trigger language plpgsql as $$begin if new.role='assistant' then raise exception 'Test assistant insert rejected';end if;return new;end$$;
    create trigger test_reject_ai_answer before insert on public.ai_messages for each row execute function public.test_reject_ai_answer();`)
  await service()
  await expect(append(a,id)).rejects.toThrow('Test assistant insert rejected')
  await db.exec('reset role;drop trigger test_reject_ai_answer on public.ai_messages;drop function public.test_reject_ai_answer()')
  await as(a)
  expect((await db.query('select * from public.ai_messages where conversation_id=$1',[id])).rows).toHaveLength(0)
})

it('rejects invalid/bounded messages and response payloads without storing a partial turn',async()=>{
  const id=await conversation(a,'Bounds')
  await service()
  await expect(append(a,id,'x'.repeat(1001))).rejects.toThrow('Invalid AI user message')
  await expect(append(a,id,'   ')).rejects.toThrow('Invalid AI user message')
  await expect(append(a,id,'Valid',{answer:42})).rejects.toThrow('Invalid AI structured response')
  await expect(append(a,id,'Valid',{answer:'x'.repeat(6001)})).rejects.toThrow('Invalid AI assistant message')
  await expect(append(a,id,'Valid',{answer:'x'+' '.repeat(6000)})).rejects.toThrow('Invalid AI assistant message')
  await expect(append(a,id,'Valid',{answer:'Valid',extra:'x'.repeat(60000)})).rejects.toThrow('Invalid AI structured response')
  await as(a)
  expect((await db.query('select * from public.ai_messages where conversation_id=$1',[id])).rows).toHaveLength(0)
})

it('deleting an owned conversation cascades its messages',async()=>{
  const id=await conversation(a,'Delete history')
  await service()
  await append(a,id)
  await as(b)
  await db.query('delete from public.ai_conversations where id=$1',[id])
  await as(a)
  expect((await db.query('select * from public.ai_messages where conversation_id=$1',[id])).rows).toHaveLength(2)
  await db.query('delete from public.ai_conversations where id=$1',[id])
  expect((await db.query('select * from public.ai_messages where conversation_id=$1',[id])).rows).toHaveLength(0)
})

it('isolates recommendation dismissals and enforces their identity/length constraints',async()=>{
  await as(a)
  await db.query('insert into public.ai_recommendation_dismissals(user_id,recommendation_id) values($1,$2)',[a,'review-renewal'])
  await expect(db.query('insert into public.ai_recommendation_dismissals(user_id,recommendation_id) values($1,$2)',[a,'review-renewal'])).rejects.toThrow()
  await expect(db.query('insert into public.ai_recommendation_dismissals(user_id,recommendation_id) values($1,$2)',[b,'forged'])).rejects.toThrow()
  await expect(db.query('insert into public.ai_recommendation_dismissals(user_id,recommendation_id) values($1,$2)',[a,'x'.repeat(101)])).rejects.toThrow()
  await as(b)
  expect((await db.query('select * from public.ai_recommendation_dismissals')).rows).toHaveLength(0)
  await db.exec('delete from public.ai_recommendation_dismissals')
  await as(a)
  expect((await db.query('select * from public.ai_recommendation_dismissals')).rows).toHaveLength(1)
  await db.exec('delete from public.ai_recommendation_dismissals')
  expect((await db.query('select * from public.ai_recommendation_dismissals')).rows).toHaveLength(0)
})

it('enforces persistent 5/minute and 50/day reservations and resets expired buckets',async()=>{
  await service()
  for(let i=0;i<5;i++) await db.query('select public.reserve_ai_request($1)',[a])
  await expect(db.query('select public.reserve_ai_request($1)',[a])).rejects.toMatchObject({code:'P0001',message:'AI quota exhausted'})
  await db.query('select public.reserve_ai_request($1)',[b])
  await db.exec('reset role')
  expect((await db.query('select minute_count,day_count from private.ai_request_usage where user_id=$1',[a])).rows[0]).toEqual({minute_count:5,day_count:5})
  await db.query("update private.ai_request_usage set minute_bucket=now()-interval '2 minutes',day_count=49 where user_id=$1",[a])
  await service()
  await db.query('select public.reserve_ai_request($1)',[a])
  await expect(db.query('select public.reserve_ai_request($1)',[a])).rejects.toThrow('AI quota exhausted')
  await db.exec('reset role')
  expect((await db.query('select minute_count,day_count from private.ai_request_usage where user_id=$1',[a])).rows[0]).toEqual({minute_count:1,day_count:50})
  await db.query("update private.ai_request_usage set minute_bucket=now()-interval '2 minutes',day_bucket=(now() at time zone 'UTC')::date-1 where user_id=$1",[a])
  await service()
  await db.query('select public.reserve_ai_request($1)',[a])
  await db.exec('reset role')
  expect((await db.query('select minute_count,day_count from private.ai_request_usage where user_id=$1',[a])).rows[0]).toEqual({minute_count:1,day_count:1})
  await as(a)
  await expect(db.query('select * from private.ai_request_usage')).rejects.toThrow()
})

it('keeps multiple conversation turns separate across user session changes',async()=>{
 const first=await conversation(a,'First conversation'),second=await conversation(a,'Second conversation')
 await service()
 await append(a,first,'First question',{answer:'First answer'})
 await append(a,second,'Second question',{answer:'Second answer'})
 await append(a,first,'Follow-up',{answer:'Follow-up answer'})
 await as(b)
 expect((await db.query('select * from public.ai_messages where conversation_id in ($1,$2)',[first,second])).rows).toHaveLength(0)
 await as(a)
 expect((await db.query('select content from public.ai_messages where conversation_id=$1 order by sequence',[first])).rows.map(r=>r.content)).toEqual(['First question','First answer','Follow-up','Follow-up answer'])
 expect((await db.query('select content from public.ai_messages where conversation_id=$1 order by sequence',[second])).rows.map(r=>r.content)).toEqual(['Second question','Second answer'])
})
it('simultaneously queued replay requests preserve one atomic turn and immutable answer',async()=>{
 const id=await conversation(b,'Queued idempotency checks'),key='44444444-4444-4444-8444-444444444444'
 await service()
 const results=await Promise.all(Array.from({length:5},()=>db.query('select public.append_ai_turn($1,$2,$3,$4::jsonb,$5) as id',[b,id,'Queued question',JSON.stringify({answer:'Canonical answer'}),key])))
 expect(new Set(results.map(r=>r.rows[0].id)).size).toBe(1)
 await as(b)
 expect((await db.query('select * from public.ai_messages where conversation_id=$1',[id])).rows).toHaveLength(2)
})
it('a missing conversation rejects a turn without creating orphan messages',async()=>{
 await service()
 const id='55555555-5555-4555-8555-555555555555'
 await expect(append(a,id)).rejects.toThrow('Conversation unavailable')
 await as(a)
 expect((await db.query('select * from public.ai_messages where conversation_id=$1',[id])).rows).toHaveLength(0)
})
