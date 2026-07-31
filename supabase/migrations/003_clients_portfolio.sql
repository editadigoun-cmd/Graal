-- 003: portefeuille clients

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,                    -- nom & prénoms, ou raison sociale pour les pharmacies
  centre text,
  specialite specialite_client not null,
  potentiel potentiel_client not null,
  categorie text,
  secteur secteur_code not null,
  jour_heure_habituel text,
  contacts text,
  observations text,
  frequence_visite_mensuelle int not null default 2,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_secteur_idx on public.clients(secteur);
create index clients_potentiel_idx on public.clients(potentiel);
create index clients_specialite_idx on public.clients(specialite);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- Fréquence par défaut selon le potentiel (paramétrable ensuite client par client)
create or replace function public.default_frequence(p potentiel_client)
returns int language sql immutable as $$
  select case p when 'FAIBLE' then 1 else 2 end;
$$;

create or replace function public.clients_apply_default_frequence()
returns trigger language plpgsql as $$
begin
  if new.frequence_visite_mensuelle is null then
    new.frequence_visite_mensuelle := public.default_frequence(new.potentiel);
  end if;
  return new;
end;
$$;

create trigger clients_default_frequence
  before insert on public.clients
  for each row execute function public.clients_apply_default_frequence();

-- Portefeuille : association Client <-> VM (un client est confié à un seul VM à la fois)
create table public.portefeuille (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  vm_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id)
);

create index portefeuille_vm_idx on public.portefeuille(vm_id);

-- Le secteur du VM doit correspondre au secteur du client au moment de l'affectation
create or replace function public.portefeuille_check_secteur()
returns trigger language plpgsql as $$
declare
  v_secteur secteur_code;
  c_secteur secteur_code;
begin
  select secteur into v_secteur from public.profiles where id = new.vm_id;
  select secteur into c_secteur from public.clients where id = new.client_id;
  if v_secteur is distinct from c_secteur then
    raise exception 'Le client (secteur %) ne peut pas être affecté à un VM du secteur %', c_secteur, v_secteur
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger portefeuille_secteur_check
  before insert or update on public.portefeuille
  for each row execute function public.portefeuille_check_secteur();

-- Catalogue des produits présentables (sélection multiple, pas de texte libre)
create table public.produits (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Journal des imports Excel du portefeuille (traçabilité)
create table public.imports_portefeuille (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references public.profiles(id),
  fichier_nom text,
  nb_lignes int not null default 0,
  nb_erreurs int not null default 0,
  statut text not null default 'TERMINE',
  details jsonb,
  created_at timestamptz not null default now()
);
