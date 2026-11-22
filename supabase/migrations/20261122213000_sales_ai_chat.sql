-- Assistant IA Pilotage des ventes : conversations, messages et quota quotidien.
-- L'agent est réservé aux administrateurs et reste en lecture seule en V1.

create table if not exists public.sales_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create index if not exists idx_sales_ai_conversations_owner_updated
  on public.sales_ai_conversations(owner_id, updated_at desc);

create table if not exists public.sales_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sales_ai_conversations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_ai_messages_conversation_created
  on public.sales_ai_messages(conversation_id, created_at);

create table if not exists public.sales_ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_day date not null default (timezone('utc', now()))::date,
  reserved_neurons numeric(12,4) not null default 300 check (reserved_neurons >= 0),
  actual_neurons numeric(12,4) not null default 0 check (actual_neurons >= 0),
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  status text not null default 'reserved' check (status in ('reserved','completed','failed')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index if not exists idx_sales_ai_usage_day_user
  on public.sales_ai_usage_reservations(usage_day, user_id);

alter table public.sales_ai_conversations enable row level security;
alter table public.sales_ai_messages enable row level security;
alter table public.sales_ai_usage_reservations enable row level security;

drop policy if exists sales_ai_conversations_admin_owner on public.sales_ai_conversations;
create policy sales_ai_conversations_admin_owner
  on public.sales_ai_conversations for all to authenticated
  using (owner_id = auth.uid() and public.is_admin())
  with check (owner_id = auth.uid() and public.is_admin());

drop policy if exists sales_ai_messages_admin_owner on public.sales_ai_messages;
create policy sales_ai_messages_admin_owner
  on public.sales_ai_messages for all to authenticated
  using (
    owner_id = auth.uid()
    and public.is_admin()
    and exists (
      select 1 from public.sales_ai_conversations c
      where c.id = conversation_id and c.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and public.is_admin()
    and exists (
      select 1 from public.sales_ai_conversations c
      where c.id = conversation_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists sales_ai_usage_admin_owner_select on public.sales_ai_usage_reservations;
create policy sales_ai_usage_admin_owner_select
  on public.sales_ai_usage_reservations for select to authenticated
  using (user_id = auth.uid() and public.is_admin());

grant select, insert, update, delete on public.sales_ai_conversations to authenticated;
grant select, insert, update, delete on public.sales_ai_messages to authenticated;
grant select on public.sales_ai_usage_reservations to authenticated;

-- Réserve 300 Neurons estimés par demande; limite compte à 20 requêtes / 6 000 Neurons
-- estimés par jour et 10 demandes par administrateur. La réservation est atomique.
create or replace function public.reserve_sales_ai_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (timezone('utc', now()))::date;
  v_account_requests integer;
  v_user_requests integer;
  v_account_reserved numeric;
  v_reservation uuid;
begin
  if v_user is null or not public.is_admin() then
    raise exception 'Accès réservé à l’administrateur.';
  end if;

  perform pg_advisory_xact_lock(hashtext('sales-ai-usage:' || v_day::text));

  select count(*), coalesce(sum(reserved_neurons), 0)
    into v_account_requests, v_account_reserved
  from public.sales_ai_usage_reservations
  where usage_day = v_day;

  select count(*) into v_user_requests
  from public.sales_ai_usage_reservations
  where usage_day = v_day and user_id = v_user;

  if v_account_requests >= 20 or v_user_requests >= 10 or v_account_reserved + 300 > 6000 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'quota_daily',
      'requests_remaining', greatest(0, 20 - v_account_requests),
      'user_requests_remaining', greatest(0, 10 - v_user_requests),
      'neurons_reserved', v_account_reserved,
      'neurons_limit', 6000
    );
  end if;

  insert into public.sales_ai_usage_reservations(user_id, usage_day, reserved_neurons, status)
  values (v_user, v_day, 300, 'reserved')
  returning id into v_reservation;

  return jsonb_build_object(
    'allowed', true,
    'reservation_id', v_reservation,
    'requests_remaining', greatest(0, 19 - v_account_requests),
    'user_requests_remaining', greatest(0, 9 - v_user_requests),
    'neurons_reserved', v_account_reserved + 300,
    'neurons_limit', 6000
  );
end;
$$;

create or replace function public.finalize_sales_ai_request(
  p_reservation_id uuid,
  p_actual_neurons numeric,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_status text default 'completed'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_updated integer;
begin
  if v_user is null or not public.is_admin() then
    raise exception 'Accès réservé à l’administrateur.';
  end if;
  if p_status not in ('completed','failed') then
    raise exception 'Statut de finalisation invalide.';
  end if;

  update public.sales_ai_usage_reservations
  set actual_neurons = greatest(coalesce(p_actual_neurons, 0), 0),
      prompt_tokens = greatest(coalesce(p_prompt_tokens, 0), 0),
      completion_tokens = greatest(coalesce(p_completion_tokens, 0), 0),
      status = p_status,
      finalized_at = now()
  where id = p_reservation_id
    and user_id = v_user
    and status = 'reserved';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Réservation IA introuvable ou déjà finalisée.';
  end if;

  return jsonb_build_object('finalized', true);
end;
$$;

revoke all on function public.reserve_sales_ai_request() from public;
revoke all on function public.finalize_sales_ai_request(uuid,numeric,integer,integer,text) from public;
grant execute on function public.reserve_sales_ai_request() to authenticated;
grant execute on function public.finalize_sales_ai_request(uuid,numeric,integer,integer,text) to authenticated;
