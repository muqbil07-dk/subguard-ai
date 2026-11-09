begin;
create table public.import_batches(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,batch_key text not null check(length(batch_key) between 1 and 200),payload jsonb not null,created_at timestamptz not null default now(),unique(user_id,batch_key));
alter table public.import_batches enable row level security;
revoke all on public.import_batches from public,anon,authenticated;
create function public.import_transactions(rows jsonb,batch text) returns integer language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid(); existing jsonb; item jsonb; idx integer := 0;
begin
 if owner is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 500 or octet_length(rows::text)>1048576 then raise exception 'Invalid import size'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text || batch,0));
 select payload into existing from public.import_batches where user_id=owner and batch_key=batch;
 if found then if existing<>rows then raise exception 'Batch key payload mismatch'; end if; return 0; end if;
 insert into public.import_batches(user_id,batch_key,payload) values(owner,batch,rows);
 for item in select value from jsonb_array_elements(rows) loop
 insert into public.transactions(user_id,merchant,amount_minor,currency,date,category,source,status,direction,batch_key,row_index)
 values(owner,item->>'merchant',(item->>'amountMinor')::bigint,item->>'currency',(item->>'date')::date,coalesce(item->>'category','Other'),'User CSV import',coalesce(item->>'status','Completed'),coalesce(item->>'direction','debit'),batch,idx);
 idx:=idx+1;
 end loop;
 return idx;
end $$;
revoke all on function public.import_transactions(jsonb,text) from public,anon;
grant execute on function public.import_transactions(jsonb,text) to authenticated;
commit;
