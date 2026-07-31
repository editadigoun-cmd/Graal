-- 007: reporting hebdomadaire, coaching et animation des superviseurs

create table public.reporting_hebdomadaire (
  id uuid primary key default gen_random_uuid(),
  vm_id uuid not null references public.profiles(id) on delete cascade,
  semaine_debut date not null,
  analyse_generale text,
  veille_concurrentielle text,
  points_forts text,
  suggestions text,
  appreciation_personnelle text,
  appreciation_superviseur text,
  recommandations_superviseur text,
  visa_superviseur_id uuid references public.profiles(id),
  visa_horodatage timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vm_id, semaine_debut)
);

create trigger reporting_set_updated_at
  before update on public.reporting_hebdomadaire
  for each row execute function public.set_updated_at();

-- Rapport de duo terrain (sortie conjointe superviseur + VM)
create table public.rapports_duo (
  id uuid primary key default gen_random_uuid(),
  superviseur_id uuid not null references public.profiles(id),
  vm_id uuid not null references public.profiles(id),
  jour date not null default public.benin_today(),
  connaissance_produits smallint not null check (connaissance_produits between 1 and 5),
  maitrise_portefeuille smallint not null check (maitrise_portefeuille between 1 and 5),
  relationnel smallint not null check (relationnel between 1 and 5),
  commentaire text,
  created_at timestamptz not null default now()
);

create index rapports_duo_vm_idx on public.rapports_duo(vm_id);

-- Plan d'activités mensuel par équipe — doit être soumis au plus tard le 25 du mois précédent
create table public.plans_activites_mensuels (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  superviseur_id uuid not null references public.profiles(id),
  mois date not null,                 -- 1er jour du mois concerné
  contenu jsonb not null default '{}'::jsonb,
  soumis_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (equipe_id, mois),
  constraint mois_est_premier_jour check (extract(day from mois) = 1)
);

create or replace function public.plan_active_equipe_mois(p_equipe uuid, p_mois date)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.plans_activites_mensuels
    where equipe_id = p_equipe and mois = date_trunc('month', p_mois)::date
  );
$$;
