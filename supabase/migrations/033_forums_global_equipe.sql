-- Forums de messagerie : un forum global (tout le monde) et un forum par équipe
-- (superviseur + ses VM), en plus des conversations directes déjà existantes.
-- Le schéma (conversations.type IN ('DIRECT','GROUPE','EQUIPE'), conversations.equipe_id,
-- messages.type IN ('text','image','audio','fichier')) existait déjà depuis 008 mais
-- n'était utilisé côté écran que pour du direct texte. Cette migration fait vivre les
-- forums group/équipe automatiquement, sans action manuelle de l'admin, via des triggers
-- qui maintiennent conversation_participants synchronisé avec les équipes/affectations.

-- ===================== forum global =====================

insert into public.conversations (id, nom, type, equipe_id, created_by)
values ('00000000-0000-0000-0000-000000000001', 'Forum général', 'GROUPE', null, null)
on conflict (id) do nothing;

insert into public.conversation_participants (conversation_id, profile_id)
select '00000000-0000-0000-0000-000000000001', id from public.profiles
on conflict do nothing;

create or replace function public.trg_profiles_sync_forums()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.conversation_participants (conversation_id, profile_id)
  values ('00000000-0000-0000-0000-000000000001', new.id)
  on conflict do nothing;

  if new.role = 'admin' then
    insert into public.conversation_participants (conversation_id, profile_id)
    select c.id, new.id from public.conversations c where c.type = 'EQUIPE'
    on conflict do nothing;
  end if;

  if new.role = 'vm' and new.equipe_id is not null
     and (tg_op = 'INSERT' or new.equipe_id is distinct from old.equipe_id) then
    insert into public.conversation_participants (conversation_id, profile_id)
    select c.id, new.id from public.conversations c where c.type = 'EQUIPE' and c.equipe_id = new.equipe_id
    on conflict do nothing;
  end if;

  if tg_op = 'UPDATE' and new.role = 'vm' and old.equipe_id is not null
     and new.equipe_id is distinct from old.equipe_id then
    delete from public.conversation_participants cp
    using public.conversations c
    where cp.conversation_id = c.id and c.type = 'EQUIPE' and c.equipe_id = old.equipe_id and cp.profile_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_forums on public.profiles;
create trigger profiles_sync_forums
  after insert or update of role, equipe_id on public.profiles
  for each row execute function public.trg_profiles_sync_forums();

-- ===================== forums d'équipe =====================

insert into public.conversations (id, nom, type, equipe_id, created_by)
select gen_random_uuid(), e.nom, 'EQUIPE', e.id, null
from public.equipes e
where not exists (select 1 from public.conversations c where c.type = 'EQUIPE' and c.equipe_id = e.id);

insert into public.conversation_participants (conversation_id, profile_id)
select c.id, p.id from public.conversations c
join public.profiles p on p.equipe_id = c.equipe_id and p.role = 'vm'
where c.type = 'EQUIPE'
on conflict do nothing;

insert into public.conversation_participants (conversation_id, profile_id)
select c.id, se.superviseur_id from public.conversations c
join public.superviseur_equipes se on se.equipe_id = c.equipe_id
where c.type = 'EQUIPE'
on conflict do nothing;

insert into public.conversation_participants (conversation_id, profile_id)
select c.id, p.id from public.conversations c, public.profiles p
where c.type = 'EQUIPE' and p.role = 'admin'
on conflict do nothing;

create or replace function public.trg_equipes_provision_forum()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.conversations (id, nom, type, equipe_id, created_by)
  values (gen_random_uuid(), new.nom, 'EQUIPE', new.id, null);

  insert into public.conversation_participants (conversation_id, profile_id)
  select c.id, p.id from public.conversations c, public.profiles p
  where c.equipe_id = new.id and c.type = 'EQUIPE' and p.role = 'admin'
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists equipes_provision_forum on public.equipes;
create trigger equipes_provision_forum
  after insert on public.equipes
  for each row execute function public.trg_equipes_provision_forum();

create or replace function public.trg_equipes_sync_forum_nom()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.nom is distinct from old.nom then
    update public.conversations set nom = new.nom where equipe_id = new.id and type = 'EQUIPE';
  end if;
  return new;
end;
$$;

drop trigger if exists equipes_sync_forum_nom on public.equipes;
create trigger equipes_sync_forum_nom
  after update of nom on public.equipes
  for each row execute function public.trg_equipes_sync_forum_nom();

create or replace function public.trg_superviseur_equipes_sync_forum()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.conversation_participants (conversation_id, profile_id)
    select c.id, new.superviseur_id from public.conversations c
    where c.type = 'EQUIPE' and c.equipe_id = new.equipe_id
    on conflict do nothing;
  elsif tg_op = 'DELETE' then
    delete from public.conversation_participants cp
    using public.conversations c
    where cp.conversation_id = c.id and c.type = 'EQUIPE' and c.equipe_id = old.equipe_id and cp.profile_id = old.superviseur_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists superviseur_equipes_sync_forum on public.superviseur_equipes;
create trigger superviseur_equipes_sync_forum
  after insert or delete on public.superviseur_equipes
  for each row execute function public.trg_superviseur_equipes_sync_forum();
