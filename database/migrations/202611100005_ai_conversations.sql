begin;

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Subscription questions' check (length(title) <= 100 and length(trim(title)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  turn_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) <= 6000 and length(trim(content)) > 0),
  structured_response jsonb check (structured_response is null or (jsonb_typeof(structured_response) = 'object' and octet_length(structured_response::text) <= 60000)),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2000),
  created_at timestamptz not null default now(),
  sequence bigint generated always as identity,
  unique (user_id, conversation_id, turn_id, role),
  foreign key (user_id, conversation_id) references public.ai_conversations(user_id, id) on delete cascade,
  check (role <> 'user' or (length(content) <= 1000 and structured_response is null))
);

create table public.ai_recommendation_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id text not null check (length(recommendation_id) <= 100 and length(trim(recommendation_id)) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, recommendation_id)
);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_recommendation_dismissals enable row level security;
revoke all on public.ai_conversations, public.ai_messages, public.ai_recommendation_dismissals from public, anon, authenticated;
revoke all on sequence public.ai_messages_sequence_seq from public, anon, authenticated;
grant select, delete on public.ai_conversations to authenticated;
grant insert (user_id, title), update (title) on public.ai_conversations to authenticated;
grant select on public.ai_messages to authenticated;
grant select, delete on public.ai_recommendation_dismissals to authenticated;
grant insert (user_id, recommendation_id) on public.ai_recommendation_dismissals to authenticated;

create policy own_select on public.ai_conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on public.ai_conversations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_update on public.ai_conversations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_delete on public.ai_conversations for delete to authenticated using ((select auth.uid()) = user_id);
create policy own_select on public.ai_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy own_select on public.ai_recommendation_dismissals for select to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on public.ai_recommendation_dismissals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_delete on public.ai_recommendation_dismissals for delete to authenticated using ((select auth.uid()) = user_id);

create index on public.ai_conversations (user_id, updated_at desc, id);
create index on public.ai_messages (user_id, conversation_id, sequence);
create trigger updated_at before update on public.ai_conversations for each row execute function public.touch_updated_at();

-- Only a server adapter with an authenticated principal may call this gateway.
-- A browser cannot write a user message or forge a provider-generated answer.
create function public.append_ai_turn(owner uuid, conversation uuid, user_text text, response jsonb, request_key uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cleaned_text text;
  answer_text text;
  assistant_id uuid;
  stored_user_text text;
begin
  if owner is null or conversation is null then
    raise exception 'Conversation unavailable' using errcode = 'P0002';
  end if;
  -- Lock the parent so concurrent turns are inserted as consecutive pairs.
  perform 1 from public.ai_conversations where id = conversation and user_id = owner for update;
  if not found then
    raise exception 'Conversation unavailable' using errcode = 'P0002';
  end if;
  cleaned_text := pg_catalog.btrim(pg_catalog.regexp_replace(user_text, '[[:cntrl:]]', '', 'g'));
  if cleaned_text is null or pg_catalog.length(cleaned_text) not between 1 and 1000 then
    raise exception 'Invalid AI user message' using errcode = '22023';
  end if;
  if request_key is null then
    raise exception 'Invalid AI request key' using errcode = '22023';
  end if;
  select id into assistant_id from public.ai_messages
    where user_id = owner and conversation_id = conversation and turn_id = request_key and role = 'assistant';
  if found then
    select content into stored_user_text from public.ai_messages
      where user_id = owner and conversation_id = conversation and turn_id = request_key and role = 'user';
    if stored_user_text is distinct from cleaned_text then
      raise exception 'AI request key reused with different input' using errcode = '23505';
    end if;
    -- The already committed answer is authoritative, even if a retry generated
    -- a different provider response before discovering that the turn exists.
    return assistant_id;
  end if;
  if response is null or pg_catalog.jsonb_typeof(response) <> 'object'
    or pg_catalog.octet_length(response::text) > 60000
    or pg_catalog.jsonb_typeof(response -> 'answer') is distinct from 'string' then
    raise exception 'Invalid AI structured response' using errcode = '22023';
  end if;
  answer_text := response ->> 'answer';
  if pg_catalog.length(answer_text) > 6000 or pg_catalog.length(pg_catalog.btrim(answer_text)) = 0 then
    raise exception 'Invalid AI assistant message' using errcode = '22023';
  end if;
  insert into public.ai_messages (user_id, conversation_id, turn_id, role, content)
    values (owner, conversation, request_key, 'user', cleaned_text);
  insert into public.ai_messages (user_id, conversation_id, turn_id, role, content, structured_response)
    values (owner, conversation, request_key, 'assistant', answer_text, response)
    returning id into assistant_id;
  update public.ai_conversations set updated_at = pg_catalog.now() where id = conversation and user_id = owner;
  return assistant_id;
end $$;

create table private.ai_request_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_bucket timestamptz not null,
  minute_count integer not null default 0 check (minute_count between 0 and 5),
  day_bucket date not null,
  day_count integer not null default 0 check (day_count between 0 and 50)
);
alter table private.ai_request_usage enable row level security;
revoke all on private.ai_request_usage from public, anon, authenticated;

-- A reservation counts the attempted request, including provider failures.
-- Persistent row locking enforces the quota across backend instances.
create function public.reserve_ai_request(owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  request_time timestamptz := pg_catalog.clock_timestamp();
  current_minute timestamptz;
  current_day date;
  usage_row private.ai_request_usage;
  next_minute_count integer;
  next_day_count integer;
begin
  if owner is null then
    raise exception 'Invalid AI quota owner' using errcode = '22023';
  end if;
  current_minute := pg_catalog.date_trunc('minute', request_time, 'UTC');
  current_day := (request_time at time zone 'UTC')::date;
  insert into private.ai_request_usage (user_id, minute_bucket, day_bucket)
    values (owner, current_minute, current_day) on conflict (user_id) do nothing;
  select * into usage_row from private.ai_request_usage where user_id = owner for update;
  -- A competing request may have held the lock across a bucket boundary.
  request_time := pg_catalog.clock_timestamp();
  current_minute := pg_catalog.date_trunc('minute', request_time, 'UTC');
  current_day := (request_time at time zone 'UTC')::date;
  next_minute_count := case when usage_row.minute_bucket = current_minute then usage_row.minute_count else 0 end;
  next_day_count := case when usage_row.day_bucket = current_day then usage_row.day_count else 0 end;
  if next_minute_count >= 5 or next_day_count >= 50 then
    raise exception 'AI quota exhausted' using errcode = 'P0001';
  end if;
  update private.ai_request_usage set minute_bucket = current_minute, day_bucket = current_day,
    minute_count = next_minute_count + 1, day_count = next_day_count + 1
    where user_id = owner;
end $$;

revoke all on function public.append_ai_turn(uuid, uuid, text, jsonb, uuid), public.reserve_ai_request(uuid) from public, anon, authenticated;
grant execute on function public.append_ai_turn(uuid, uuid, text, jsonb, uuid), public.reserve_ai_request(uuid) to service_role;

commit;
