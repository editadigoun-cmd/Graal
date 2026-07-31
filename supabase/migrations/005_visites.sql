-- 005: visites, produits présentés, motifs

create table public.motifs_non_visite (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique,
  ordre int not null default 0,
  actif boolean not null default true
);

create table public.visites (
  id uuid primary key default gen_random_uuid(),
  programme_ligne_id uuid references public.programme_lignes(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete restrict,
  vm_id uuid not null references public.profiles(id) on delete cascade,
  jour date not null,
  type_visite type_visite not null,
  statut statut_visite not null default 'REALISEE',
  hors_programme boolean not null default false,
  motif_hors_programme_id uuid references public.motifs_non_visite(id),
  motif_hors_programme_commentaire text,

  -- volet médical
  cachet_prospect boolean not null default false,
  cachet_centre boolean not null default false,
  promesses_obtenues text,
  promesses_libre text,
  prescriptions_constatees int not null default 0,

  -- volet pharmacie
  stock_disponible stock_niveau,
  commande_obtenue text,
  veille_concurrentielle text,

  -- horodatage / géolocalisation serveur, non modifiables par le VM
  horodatage timestamptz not null default now(),
  latitude double precision not null,
  longitude double precision not null,

  created_at timestamptz not null default now(),

  constraint hors_programme_a_motif check (not hors_programme or motif_hors_programme_id is not null),
  constraint prescriptions_positives check (prescriptions_constatees >= 0)
);

create index visites_vm_jour_idx on public.visites(vm_id, jour);
create index visites_client_idx on public.visites(client_id);
create index visites_programme_ligne_idx on public.visites(programme_ligne_id);

create table public.visite_produits (
  visite_id uuid not null references public.visites(id) on delete cascade,
  produit_id uuid not null references public.produits(id) on delete restrict,
  primary key (visite_id, produit_id)
);

-- Motif obligatoire pour chaque visite programmée non réalisée, saisi à la clôture
create table public.visite_manquante_motifs (
  id uuid primary key default gen_random_uuid(),
  programme_ligne_id uuid not null references public.programme_lignes(id) on delete cascade,
  motif_id uuid not null references public.motifs_non_visite(id),
  commentaire text,
  cree_par uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (programme_ligne_id)
);
