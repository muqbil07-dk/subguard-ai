begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 user_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),
 email text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(id=user_id)
);
create table public.user_preferences (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
 currency text not null default 'INR' check(currency in ('INR','USD','EUR','GBP','JPY')),
 renewal_reminders boolean not null default true, unusual_charges boolean not null default true, weekly_digest boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80), category text not null check(length(category) between 1 and 40),
 amount_minor bigint not null check(amount_minor > 0 and amount_minor <= 100000000000), currency text not null check(currency in ('INR','USD','EUR','GBP','JPY')),
 frequency text not null check(frequency in ('Weekly','Monthly','Quarterly','Yearly')), next_renewal date not null,
 status text not null default 'Active' check(status in ('Active','Paused','Cancelled')), unused boolean not null default false, reminder boolean not null default true,
 color text not null default '#9279ff' check(color ~ '^#[0-9a-fA-F]{6}$'), initials text not null default '' check(length(initials)<=3),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,id)
);
create table public.transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 merchant text not null check(length(trim(merchant)) between 1 and 80), amount_minor bigint not null check(amount_minor>=0 and amount_minor<=100000000000),
 currency text not null check(currency in ('INR','USD','EUR','GBP','JPY')), date date not null, category text not null check(length(category) between 1 and 40),
 source text not null default 'User CSV import' check(source='User CSV import'), status text not null check(status in ('Completed','Pending','Reversed')),
 direction text not null check(direction in ('debit','credit')), batch_key text not null check(length(batch_key) between 1 and 200), row_index integer not null check(row_index>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,batch_key,row_index)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), body text not null, read_at timestamptz,
 delivery_key text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,delivery_key)
);
create table public.ai_insights (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, description text not null, provenance text not null check(provenance in ('deterministic','verified_provider')),
 evidence jsonb not null default '[]', dismissed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.paypal_webhook_events (
 id uuid primary key default gen_random_uuid(), provider_event_id text not null, environment text not null check(environment in ('sandbox','live')),
 verified_at timestamptz not null, payload_digest text not null, payload jsonb not null, status text not null default 'pending' check(status in ('pending','processed','failed','quarantined')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(environment,provider_event_id)
);
create trigger updated_at before update on private.paypal_webhook_events for each row execute function public.touch_updated_at();
alter table private.paypal_webhook_events enable row level security;
revoke all on private.paypal_webhook_events from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['profiles','user_preferences','subscriptions','transactions','notifications','ai_insights'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy own_select on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 execute format('create trigger updated_at before update on public.%I for each row execute function public.touch_updated_at()',t);
 execute format('create index on public.%I (user_id)',t);
 end loop;
 foreach t in array array['subscriptions','transactions'] loop
 execute format('grant insert,update,delete on public.%I to authenticated',t);
 execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
 execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
 execute format('create policy own_delete on public.%I for delete to authenticated using ((select auth.uid())=user_id)',t);
 end loop;
 foreach t in array array['profiles','user_preferences','notifications','ai_insights'] loop
 execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
 end loop;
end $$;
grant update(name) on public.profiles to authenticated;
grant update(currency,renewal_reminders,unusual_charges,weekly_digest) on public.user_preferences to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant update(dismissed) on public.ai_insights to authenticated;
create index on public.transactions(user_id,date desc,id);
create index on public.subscriptions(user_id,next_renewal);
create function public.initialize_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,user_id,name,email) values(new.id,new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Member'),80),coalesce(new.email,''));
 insert into public.user_preferences(user_id) values(new.id);
 return new;
end $$;
revoke all on function public.initialize_user() from public,anon,authenticated;
create trigger initialize_user after insert on auth.users for each row execute function public.initialize_user();
insert into public.profiles(id,user_id,name,email) select id,id,left(coalesce(nullif(trim(raw_user_meta_data->>'name'),''),'Member'),80),coalesce(email,'') from auth.users on conflict do nothing;
insert into public.user_preferences(user_id) select id from auth.users on conflict do nothing;
commit;
