-- 004: programme hebdomadaire, lignes, dérogations, fusions de secteurs

create table public.programmes_hebdomadaires (
  id uuid primary key default gen_random_uuid(),
  vm_id uuid not null references public.profiles(id) on delete cascade,
  semaine_debut date not null,             -- lundi de la semaine concernée
  statut statut_programme not null default 'BROUILLON',
  mode_pharmacie_uniquement boolean not null default false,
  soumis_at timestamptz,
  valide_at timestamptz,
  valide_par uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vm_id, semaine_debut),
  constraint semaine_debut_est_un_lundi check (extract(isodow from semaine_debut) = 1)
);

create index programmes_vm_idx on public.programmes_hebdomadaires(vm_id);
create index programmes_semaine_idx on public.programmes_hebdomadaires(semaine_debut);

create trigger programmes_set_updated_at
  before update on public.programmes_hebdomadaires
  for each row execute function public.set_updated_at();

-- Dérogation explicite admin permettant à un client d'être programmé plus d'une fois / semaine
create table public.derogations_doublon_client (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes_hebdomadaires(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  autorise_par uuid not null references public.profiles(id),
  motif text,
  created_at timestamptz not null default now(),
  unique (programme_id, client_id)
);

-- Fusion stratégique temporaire de deux secteurs sur un ou plusieurs potentiels, pour une semaine donnée
create table public.fusions_secteurs (
  id uuid primary key default gen_random_uuid(),
  semaine_debut date not null,
  potentiels potentiel_client[] not null,
  cree_par uuid not null references public.profiles(id),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create index fusions_semaine_idx on public.fusions_secteurs(semaine_debut) where actif;

create or replace function public.fusion_active(p_semaine date, p_potentiel potentiel_client)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.fusions_secteurs
    where semaine_debut = p_semaine and actif and p_potentiel = any(potentiels)
  );
$$;

-- Lignes du programme : un client programmé un jour donné, pour un type de visite
create table public.programme_lignes (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes_hebdomadaires(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  jour jour_semaine not null,
  type_visite type_visite not null,
  ordre int not null default 0,
  created_at timestamptz not null default now()
);

create index programme_lignes_programme_idx on public.programme_lignes(programme_id);
create index programme_lignes_client_idx on public.programme_lignes(client_id);
-- Pas d'index unique strict ici : un même client peut apparaître 2 fois dans la semaine
-- uniquement si une dérogation administrateur existe (derogations_doublon_client).
-- La règle est appliquée par le trigger de validation (voir 010_business_rules.sql).
