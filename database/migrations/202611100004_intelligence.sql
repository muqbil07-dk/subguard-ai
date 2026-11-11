begin;
alter table public.subscriptions drop constraint subscriptions_frequency_check;
alter table public.subscriptions add constraint subscriptions_frequency_check check(frequency in ('Weekly','Monthly','Quarterly','Half-yearly','Yearly'));
create table public.recurring_detection_suggestions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 dedupe_key text not null, merchant text not null, identity text not null, currency text not null check(currency in ('INR','USD','EUR','GBP','JPY')),
 amount_minor bigint not null check(amount_minor>=0 and amount_minor<=100000000000), frequency text check(frequency in ('Weekly','Monthly','Quarterly','Half-yearly','Yearly')),
 confidence integer not null check(confidence between 0 and 100), state text not null check(state in ('Suggested','Insufficient evidence','Confirmed','Rejected')),
 payload jsonb not null, rule_version text not null, subscription_id uuid, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,dedupe_key),foreign key(user_id,subscription_id) references public.subscriptions(user_id,id) on delete set null (subscription_id)
);
create table public.transaction_anomalies (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 dedupe_key text not null,type text not null check(type in ('price_increase','price_decrease','unexpected_amount','irregular_interval','possible_duplicate')),
 currency text not null check(currency in ('INR','USD','EUR','GBP','JPY')),payload jsonb not null,review_status text not null default 'unreviewed' check(review_status in ('unreviewed','reviewed')),
 active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,dedupe_key)
);
do $$declare t text;begin foreach t in array array['recurring_detection_suggestions','transaction_anomalies'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy own_select on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 execute format('create index on public.%I (user_id,created_at,id)',t);
 execute format('create trigger updated_at before update on public.%I for each row execute function public.touch_updated_at()',t);
end loop;end $$;
create function public.persist_intelligence(owner uuid,result jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended(owner::text,1));
 update public.transaction_anomalies set active=false where user_id=owner;
 for item in select value from jsonb_array_elements(result->'suggestions') loop
 insert into public.recurring_detection_suggestions(user_id,dedupe_key,merchant,identity,currency,amount_minor,frequency,confidence,state,payload,rule_version)
 values(owner,item->>'dedupe_key',item->>'merchant',item->>'identity',item->>'currency',(item->>'amountMinor')::bigint,item->>'frequency',(item->>'confidence')::integer,item->>'state',item,result->>'ruleVersion')
 on conflict(user_id,dedupe_key) do update set amount_minor=excluded.amount_minor,frequency=excluded.frequency,confidence=excluded.confidence,payload=excluded.payload,rule_version=excluded.rule_version,state=case when public.recurring_detection_suggestions.state in ('Confirmed','Rejected') then public.recurring_detection_suggestions.state else excluded.state end;
 n:=n+1;
 end loop;
 -- Retain review history while explicitly invalidating unsupported old suggestions.
 update public.recurring_detection_suggestions set state='Insufficient evidence' where user_id=owner and state='Suggested' and dedupe_key not in (select value->>'dedupe_key' from jsonb_array_elements(result->'suggestions'));
 for item in select value from jsonb_array_elements(result->'findings') loop
 insert into public.transaction_anomalies(user_id,dedupe_key,type,currency,payload) values(owner,item->>'dedupe_key',item->>'type',item->>'currency',item)
 on conflict(user_id,dedupe_key) do update set payload=excluded.payload,active=true;
 end loop;return n;
end $$;
create function public.review_recurring(owner uuid,suggestion uuid,decision text) returns uuid language plpgsql security definer set search_path='' as $$
declare row public.recurring_detection_suggestions; sub uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(owner::text,1));
 select * into row from public.recurring_detection_suggestions where id=suggestion and user_id=owner for update;
 if not found then raise exception 'Suggestion unavailable' using errcode='P0002';end if;
 if decision='reject' then if row.state='Confirmed' then raise exception 'Already confirmed' using errcode='23505';end if;update public.recurring_detection_suggestions set state='Rejected' where id=suggestion;return null;end if;
 if decision IS DISTINCT FROM 'confirm' then raise exception 'Invalid decision';end if;
 if row.state='Confirmed' then if row.subscription_id is null then raise exception 'Confirmed tracking was removed' using errcode='23505';end if;return row.subscription_id;end if;
 if row.state<>'Suggested' or row.frequency is null then raise exception 'Not confirmable' using errcode='23505';end if;
 insert into public.subscriptions(user_id,name,category,amount_minor,currency,frequency,next_renewal,status)
 values(owner,row.merchant,'Other',row.amount_minor,row.currency,row.frequency,(row.payload->'prediction'->>'nextPaymentDate')::date,'Active') returning id into sub;
 update public.recurring_detection_suggestions set state='Confirmed',subscription_id=sub where id=suggestion;
 return sub;
end $$;
revoke all on function public.persist_intelligence(uuid,jsonb),public.review_recurring(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.persist_intelligence(uuid,jsonb),public.review_recurring(uuid,uuid,text) to service_role;
commit;
