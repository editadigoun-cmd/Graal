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
