-- Daily VAD / Duo tracking: one record per supervisor, VM and day.
create table if not exists public.vad_duo_journaliers (
  id uuid primary key default gen_random_uuid(),
  superviseur_id uuid not null references public.profiles(id) on delete cascade,
  vm_id uuid not null references public.profiles(id) on delete restrict,
  jour date not null default public.benin_today(),
  mode text not null check (mode in ('COTONOU','HORS_COTONOU')),
  statut text not null default 'PROGRAMME' check (statut in ('PROGRAMME','EN_COURS','TERMINE')),
  programme_ligne_ids uuid[] not null default '{}',
  medecins_vus_ids uuid[] not null default '{}',
  observations text,
  compte_rendu text,
  started_at timestamptz,
  ended_at timestamptz,
  start_latitude double precision,
  start_longitude double precision,
  end_latitude double precision,
  end_longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (superviseur_id, vm_id, jour)
);
alter table public.vad_duo_journaliers enable row level security;
drop policy if exists vad_duo_journaliers_select on public.vad_duo_journaliers;
create policy vad_duo_journaliers_select on public.vad_duo_journaliers
for select to authenticated using (
  superviseur_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);
drop policy if exists vad_duo_journaliers_insert on public.vad_duo_journaliers;
create policy vad_duo_journaliers_insert on public.vad_duo_journaliers
for insert to authenticated with check (
  superviseur_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='superviseur')
  and exists (select 1 from public.profiles vm where vm.id=vm_id and vm.role='vm' and vm.actif=true)
);
drop policy if exists vad_duo_journaliers_update on public.vad_duo_journaliers;
create policy vad_duo_journaliers_update on public.vad_duo_journaliers
for update to authenticated using (
  superviseur_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
) with check (
  superviseur_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);
grant select, insert, update on public.vad_duo_journaliers to authenticated;
create index if not exists idx_vad_duo_journaliers_superviseur_jour on public.vad_duo_journaliers(superviseur_id,jour desc);
create index if not exists idx_vad_duo_journaliers_vm_jour on public.vad_duo_journaliers(vm_id,jour desc);

-- Restrict a supervisor to their linked team; Marc is limited to TIL Sud.
drop policy if exists vad_duo_journaliers_insert on public.vad_duo_journaliers;
create policy vad_duo_journaliers_insert on public.vad_duo_journaliers
for insert to authenticated with check (
  superviseur_id = (select auth.uid())
  and exists (
    select 1 from public.profiles supervisor
    join public.superviseur_equipes se on se.superviseur_id=supervisor.id
    join public.profiles vm on vm.id=vad_duo_journaliers.vm_id and vm.equipe_id=se.equipe_id
    where supervisor.id=(select auth.uid())
      and supervisor.role='superviseur'
      and vm.role='vm' and vm.actif=true
      and (
        supervisor.id <> '847d0024-7def-45d1-a669-d7276502ca32'::uuid
        or vm.id in (
          '62cdc900-5544-470a-94bf-ef30c9c8fb2f'::uuid,
          'f7c8b228-1978-4b68-bca8-8e745866b0b8'::uuid,
          'd53c31c1-5adb-4549-82ca-0fff2a6692dd'::uuid,
          'd73bdceb-4bb3-496c-9d74-d24f6907c3b0'::uuid,
          '34deced5-26da-44c4-9bd5-7950e13552a9'::uuid,
          '180dedac-597a-47c9-97d5-8b5d93109f25'::uuid,
          'db3b946a-165e-4a20-91e0-073c2e170a72'::uuid,
          'a0436f11-d425-4014-9733-5c7cc4271189'::uuid
        )
      )
  )
);

-- Keep updates inside the supervisor's own assigned VM scope.
drop policy if exists vad_duo_journaliers_update on public.vad_duo_journaliers;
create policy vad_duo_journaliers_update on public.vad_duo_journaliers
for update to authenticated using (
  superviseur_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
) with check (
  exists (
    select 1 from public.profiles supervisor
    join public.superviseur_equipes se on se.superviseur_id=supervisor.id
    join public.profiles vm on vm.id=vad_duo_journaliers.vm_id and vm.equipe_id=se.equipe_id
    where supervisor.id=vad_duo_journaliers.superviseur_id
      and supervisor.id=(select auth.uid())
      and supervisor.role='superviseur'
      and vm.role='vm' and vm.actif=true
      and (
        supervisor.id <> '847d0024-7def-45d1-a669-d7276502ca32'::uuid
        or vm.id in (
          '62cdc900-5544-470a-94bf-ef30c9c8fb2f'::uuid,
          'f7c8b228-1978-4b68-bca8-8e745866b0b8'::uuid,
          'd53c31c1-5adb-4549-82ca-0fff2a6692dd'::uuid,
          'd73bdceb-4bb3-496c-9d74-d24f6907c3b0'::uuid,
          '34deced5-26da-44c4-9bd5-7950e13552a9'::uuid,
          '180dedac-597a-47c9-97d5-8b5d93109f25'::uuid,
          'db3b946a-165e-4a20-91e0-073c2e170a72'::uuid,
          'a0436f11-d425-4014-9733-5c7cc4271189'::uuid
        )
      )
  )
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin')
);

-- Enforce the agreed TIL Sud monthly quotas at database level.
create or replace function public.enforce_til_sud_vad_quota()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_quota integer;
  v_used integer;
begin
  if new.superviseur_id <> '847d0024-7def-45d1-a669-d7276502ca32'::uuid
     or new.statut not in ('EN_COURS','TERMINE') then
    return new;
  end if;
  v_quota := case new.vm_id
    when '62cdc900-5544-470a-94bf-ef30c9c8fb2f'::uuid then 5
    when 'f7c8b228-1978-4b68-bca8-8e745866b0b8'::uuid then 3
    when 'd53c31c1-5adb-4549-82ca-0fff2a6692dd'::uuid then 3
    when 'd73bdceb-4bb3-496c-9d74-d24f6907c3b0'::uuid then 3
    when '34deced5-26da-44c4-9bd5-7950e13552a9'::uuid then 3
    when '180dedac-597a-47c9-97d5-8b5d93109f25'::uuid then 3
    when 'db3b946a-165e-4a20-91e0-073c2e170a72'::uuid then 3
    when 'a0436f11-d425-4014-9733-5c7cc4271189'::uuid then 3
    else null
  end;
  if v_quota is null then
    raise exception 'Ce VM ne fait pas partie du périmètre TIL Sud de Marc.';
  end if;
  select count(*) into v_used
  from public.vad_duo_journaliers d
  where d.superviseur_id = new.superviseur_id
    and d.vm_id = new.vm_id
    and date_trunc('month', d.jour) = date_trunc('month', new.jour)
    and d.statut in ('EN_COURS','TERMINE')
    and d.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_used >= v_quota then
    raise exception 'Quota VAD mensuel atteint pour ce VM (% jours).', v_quota;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_enforce_til_sud_vad_quota on public.vad_duo_journaliers;
create trigger trg_enforce_til_sud_vad_quota
before insert or update of superviseur_id, vm_id, jour, statut
on public.vad_duo_journaliers
for each row execute function public.enforce_til_sud_vad_quota();
revoke all on function public.enforce_til_sud_vad_quota() from public, anon, authenticated;
