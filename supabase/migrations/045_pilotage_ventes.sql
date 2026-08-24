-- 045: Pilotage hebdomadaire des ventes — analyse transversale des ventes par rapport aux
-- objectifs mensuels (éclatés en objectif hebdomadaire), stock disponible par grossiste et
-- valeur de stock, demandée par le client (fichier PILOTAGE_HEBDOMADAIRE_DES_VENTES.xlsx).
--
-- Choix de conception (validés avec le client) :
--   - Saisie manuelle hebdomadaire des ventes et des stocks (pas d'intégration grossiste automatisée).
--   - Catalogue produit unifié : on RÉUTILISE la table produits existante (pas de duplication),
--     étendue par une table séparée produits_pilotage (laboratoire + PGHT). Cette séparation
--     est volontaire : produits_select autorise déjà un VM à lire les produits de son équipe
--     (visites, portefeuille…), et le PGHT est une donnée commerciale sensible qui ne doit être
--     visible que par l'admin/le superviseur — la mettre directement sur produits l'aurait exposée.
--   - PGHT = prix unitaire du produit (terminologie du client).

create table public.laboratoires (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.grossistes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.produits_pilotage (
  produit_id uuid primary key references public.produits(id) on delete cascade,
  laboratoire_id uuid not null references public.laboratoires(id),
  pght numeric(10,2) not null check (pght >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger produits_pilotage_set_updated_at
  before update on public.produits_pilotage
  for each row execute function public.set_updated_at();

create table public.objectifs_mensuels_produits (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  mois date not null check (mois = date_trunc('month', mois)::date),
  objectif_quantite numeric(10,2) not null check (objectif_quantite >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (produit_id, mois)
);

create trigger objectifs_mensuels_produits_set_updated_at
  before update on public.objectifs_mensuels_produits
  for each row execute function public.set_updated_at();

create table public.ventes_hebdomadaires (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  grossiste_id uuid not null references public.grossistes(id),
  semaine_debut date not null,
  quantite numeric(10,2) not null default 0 check (quantite >= 0),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (produit_id, grossiste_id, semaine_debut)
);

create trigger ventes_hebdomadaires_set_updated_at
  before update on public.ventes_hebdomadaires
  for each row execute function public.set_updated_at();

create table public.stocks_hebdomadaires (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  grossiste_id uuid not null references public.grossistes(id),
  semaine_debut date not null,
  quantite numeric(10,2) not null default 0 check (quantite >= 0),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (produit_id, grossiste_id, semaine_debut)
);

create trigger stocks_hebdomadaires_set_updated_at
  before update on public.stocks_hebdomadaires
  for each row execute function public.set_updated_at();

create index idx_objectifs_mensuels_produits_produit on public.objectifs_mensuels_produits(produit_id, mois);
create index idx_ventes_hebdomadaires_produit on public.ventes_hebdomadaires(produit_id, semaine_debut);
create index idx_stocks_hebdomadaires_produit on public.stocks_hebdomadaires(produit_id, semaine_debut);

-- ============================================================
-- RLS — module réservé à l'admin et au superviseur (données commerciales/financières),
-- jamais exposé aux VM.
-- ============================================================
alter table public.laboratoires enable row level security;
alter table public.grossistes enable row level security;
alter table public.produits_pilotage enable row level security;
alter table public.objectifs_mensuels_produits enable row level security;
alter table public.ventes_hebdomadaires enable row level security;
alter table public.stocks_hebdomadaires enable row level security;

create policy laboratoires_select on public.laboratoires for select
  using (public.is_admin() or public.is_superviseur());
create policy laboratoires_write on public.laboratoires for all
  using (public.is_admin()) with check (public.is_admin());

create policy grossistes_select on public.grossistes for select
  using (public.is_admin() or public.is_superviseur());
create policy grossistes_write on public.grossistes for all
  using (public.is_admin()) with check (public.is_admin());

create policy produits_pilotage_select on public.produits_pilotage for select
  using (public.is_admin() or public.is_superviseur());
create policy produits_pilotage_write on public.produits_pilotage for all
  using (public.is_admin()) with check (public.is_admin());

create policy objectifs_mensuels_produits_select on public.objectifs_mensuels_produits for select
  using (public.is_admin() or public.is_superviseur());
create policy objectifs_mensuels_produits_write on public.objectifs_mensuels_produits for all
  using (public.is_admin() or public.is_superviseur()) with check (public.is_admin() or public.is_superviseur());

create policy ventes_hebdomadaires_select on public.ventes_hebdomadaires for select
  using (public.is_admin() or public.is_superviseur());
create policy ventes_hebdomadaires_write on public.ventes_hebdomadaires for all
  using (public.is_admin() or public.is_superviseur()) with check (public.is_admin() or public.is_superviseur());

create policy stocks_hebdomadaires_select on public.stocks_hebdomadaires for select
  using (public.is_admin() or public.is_superviseur());
create policy stocks_hebdomadaires_write on public.stocks_hebdomadaires for all
  using (public.is_admin() or public.is_superviseur()) with check (public.is_admin() or public.is_superviseur());

-- ============================================================
-- Données de référence
-- ============================================================
insert into public.laboratoires (nom) values
  ('TIL'), ('ELEA'), ('DICAMEX'), ('MEDINFAR'), ('ODYPHARM')
on conflict (nom) do nothing;

insert into public.grossistes (nom) values
  ('UBPHAR'), ('PROMO'), ('UBI PHARM'), ('GAPOB')
on conflict (nom) do nothing;

-- Catalogue réel du laboratoire TIL (22 produits, PGHT et objectif mensuel), extrait du fichier
-- PILOTAGE_HEBDOMADAIRE_DES_VENTES.xlsx fourni par le client. Les 4 autres laboratoires
-- (ELEA, DICAMEX, MEDINFAR, ODYPHARM) sont créés vides : à compléter par l'admin depuis l'écran.
do $$
declare
  v_lab_id uuid;
  v_equipe_id uuid;
  v_produit_id uuid;
  v_mois date := date_trunc('month', current_date)::date;
  r record;
begin
  select id into v_lab_id from public.laboratoires where nom = 'TIL';
  select id into v_equipe_id from public.equipes where nom = 'TIL';

  if v_lab_id is null or v_equipe_id is null then
    raise notice 'Laboratoire ou équipe "TIL" introuvable : catalogue TIL non importé automatiquement (à saisir manuellement depuis l''écran Pilotage des ventes)';
    return;
  end if;

  for r in
    select * from (values
      ('Ambrolite GS Syrup', 2.35, 1200),
      ('Aminocal Tab', 3.30, 2000),
      ('Apetamin Syrup', 1.75, 5000),
      ('Armetrine Tab 20/120', 1.28, 7000),
      ('ArmetrineTab 80/480', 1.90, 2000),
      ('Astyfer Capsules Capsule', 2.59, 800),
      ('Astyfer Liquid 110ml', 2.17, 800),
      ('Astyfer Liquid 200ml', 2.70, 2000),
      ('Astymin C Drops 15ml', 1.05, 7000),
      ('Astymin Forte Capsules', 2.00, 2300),
      ('Astymin Liquid 110ml', 2.17, 2000),
      ('Astymin Liquid 200 ml', 2.70, 1800),
      ('Astymin SN Infusion 200ml', 5.00, 5000),
      ('Fevastin IV 100ml', 1.05, 12000),
      ('Hapenz sirop 200ml', 2.00, 561),
      ('Hapitime 50 mg strips B/5', 5.00, 42),
      ('Netrosac tab 30', 4.40, 175),
      ('Neutrosec Liquid 200ml', 2.10, 1250),
      ('Ometil Capsules', 0.98, 1195),
      ('Tilvom strips B/5', 4.40, 400),
      ('Urelog Cap B/100', 35.00, 9),
      ('Zithrotil Tab 500mg', 3.00, 500)
    ) as t(nom, pght, objectif_mensuel)
  loop
    insert into public.produits (nom, equipe_id)
      values (r.nom, v_equipe_id)
      on conflict (equipe_id, nom) do nothing;

    select id into v_produit_id from public.produits where equipe_id = v_equipe_id and nom = r.nom;

    insert into public.produits_pilotage (produit_id, laboratoire_id, pght)
      values (v_produit_id, v_lab_id, r.pght)
      on conflict (produit_id) do update set laboratoire_id = excluded.laboratoire_id, pght = excluded.pght;

    insert into public.objectifs_mensuels_produits (produit_id, mois, objectif_quantite)
      values (v_produit_id, v_mois, r.objectif_mensuel)
      on conflict (produit_id, mois) do update set objectif_quantite = excluded.objectif_quantite;
  end loop;
end $$;
