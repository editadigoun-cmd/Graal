-- Étend l'indicateur d'animation d'équipe (audit cahier des charges, point 12) : au-delà
-- du duo terrain, du reporting visé et des plans soumis (déjà calculés automatiquement),
-- le superviseur journalise ici ses points quotidiens, réunions, challenges, formation
-- continue, coaching terrain et argumentaires travaillés avec ses VM.

create type public.type_animation as enum (
  'POINT_QUOTIDIEN', 'REUNION_LUNDI', 'REUNION_MERCREDI', 'CHALLENGE',
  'FORMATION_CONTINUE', 'COACHING_TERRAIN', 'ARGUMENTAIRE_VM'
);

create table public.activites_animation (
  id uuid primary key default gen_random_uuid(),
  superviseur_id uuid not null references public.profiles(id) on delete cascade,
  equipe_id uuid not null references public.equipes(id),
  vm_id uuid references public.profiles(id) on delete cascade,
  type public.type_animation not null,
  jour date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index activites_animation_superviseur_idx on public.activites_animation(superviseur_id);
create index activites_animation_jour_idx on public.activites_animation(jour);

alter table public.activites_animation enable row level security;

create policy activites_animation_select on public.activites_animation for select to authenticated using (
  public.is_admin() or superviseur_id = auth.uid() or public.is_vm_in_my_scope(vm_id)
);

create policy activites_animation_insert on public.activites_animation for insert to authenticated with check (
  superviseur_id = auth.uid() and (public.is_superviseur() or public.is_admin())
);
