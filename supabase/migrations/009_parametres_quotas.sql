-- 009: paramètres administrables & quotas cibles

create table public.parametres (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create trigger parametres_set_updated_at
  before update on public.parametres
  for each row execute function public.set_updated_at();

create or replace function public.get_parametre(p_key text)
returns jsonb language sql stable as $$
  select value from public.parametres where key = p_key;
$$;

create table public.quotas_cibles (
  cible text primary key,
  libelle text not null,
  quota_hebdomadaire int not null,
  ordre int not null default 0
);

create table public.cible_specialite_map (
  cible text not null references public.quotas_cibles(cible) on delete cascade,
  specialite specialite_client not null,
  primary key (cible, specialite)
);

create or replace function public.cible_pour_specialite(p_specialite specialite_client)
returns text language sql stable as $$
  select cible from public.cible_specialite_map where specialite = p_specialite limit 1;
$$;
