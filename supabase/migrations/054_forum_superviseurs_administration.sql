-- 054: discussion interne superviseurs + administration
-- Le type FORUM_MANAGER est explicitement autorisé dans conversations.
alter table public.conversations
  drop constraint if exists conversations_type_check;

alter table public.conversations
  add constraint conversations_type_check
  check (type in ('DIRECT', 'GROUPE', 'EQUIPE', 'FORUM_MANAGER'));

-- Un seul forum interne global.
create unique index if not exists conversations_forum_manager_unique
  on public.conversations(type)
  where type = 'FORUM_MANAGER';

-- Les administrateurs et superviseurs peuvent voir/utiliser ce forum.
create or replace function public.provision_forum_superviseurs()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.conversations
  where type = 'FORUM_MANAGER'
  limit 1;

  if v_id is null then
    insert into public.conversations (nom, type, created_by)
    values ('Superviseurs & Administration', 'FORUM_MANAGER', auth.uid())
    returning id into v_id;
  end if;

  insert into public.conversation_participants (conversation_id, profile_id)
  select v_id, p.id
  from public.profiles p
  where p.role in ('admin', 'superviseur')
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.provision_forum_superviseurs() from public, anon;
grant execute on function public.provision_forum_superviseurs() to authenticated;
