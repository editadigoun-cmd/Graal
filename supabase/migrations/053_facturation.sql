-- 053: module Facturation (clients/produits indépendants du portefeuille VM)
create table if not exists public.billing_clients (
  id uuid primary key default gen_random_uuid(),
  code text,
  nom text not null,
  adresse text,
  telephone text,
  email text,
  nif text,
  rccm text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_products (
  id uuid primary key default gen_random_uuid(),
  reference text,
  designation text not null,
  unite text not null default 'Unité',
  prix_unitaire numeric(14,2) not null default 0,
  description text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_counters (
  annee int not null,
  type text not null check (type in ('PF','BL')),
  dernier_numero int not null default 0,
  primary key (annee,type)
);

create or replace function public.next_billing_number(p_type text)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_year int := extract(year from (now() at time zone 'Africa/Porto-Novo'))::int; v_n int;
begin
  if p_type not in ('PF','BL') then raise exception 'Type de document invalide'; end if;
  insert into billing_counters(annee,type,dernier_numero) values(v_year,p_type,1)
  on conflict (annee,type) do update set dernier_numero=billing_counters.dernier_numero+1
  returning dernier_numero into v_n;
  return p_type||'-'||v_year||'-'||lpad(v_n::text,4,'0');
end;
$$;

create table if not exists public.proformas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique default public.next_billing_number('PF'),
  date_emission date not null default (now() at time zone 'Africa/Porto-Novo')::date,
  client_id uuid not null references billing_clients(id),
  objet text,
  reference_commande text,
  conditions text,
  total numeric(14,2) not null default 0,
  statut text not null default 'BROUILLON' check (statut in ('BROUILLON','EMISEE','ANNULEE')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proforma_items (
  id uuid primary key default gen_random_uuid(),
  proforma_id uuid not null references proformas(id) on delete cascade,
  product_id uuid not null references billing_products(id),
  designation text not null,
  unite text not null,
  prix_unitaire numeric(14,2) not null default 0,
  quantite numeric(14,2) not null default 0,
  montant numeric(14,2) generated always as (prix_unitaire * quantite) stored,
  ordre int not null default 1
);

create table if not exists public.bordereaux_livraison (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique default public.next_billing_number('BL'),
  date_livraison date not null default (now() at time zone 'Africa/Porto-Novo')::date,
  proforma_id uuid not null references proformas(id),
  client_id uuid not null references billing_clients(id),
  reference_commande text,
  objet text,
  observations text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bordereau_items (
  id uuid primary key default gen_random_uuid(),
  bordereau_id uuid not null references bordereaux_livraison(id) on delete cascade,
  proforma_item_id uuid not null references proforma_items(id),
  designation text not null,
  unite text not null,
  quantite_commandee numeric(14,2) not null default 0,
  quantite_livree numeric(14,2) not null default 0,
  ordre int not null default 1
);

create index if not exists proformas_client_idx on proformas(client_id);
create index if not exists proformas_date_idx on proformas(date_emission);
create index if not exists bl_proforma_idx on bordereaux_livraison(proforma_id);

alter table billing_clients enable row level security;
alter table billing_products enable row level security;
alter table billing_counters enable row level security;
alter table proformas enable row level security;
alter table proforma_items enable row level security;
alter table bordereaux_livraison enable row level security;
alter table bordereau_items enable row level security;

drop policy if exists billing_clients_management on billing_clients;
create policy billing_clients_management on billing_clients for all using (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur'))) with check (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur')));

drop policy if exists billing_products_management on billing_products;
create policy billing_products_management on billing_products for all using (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur'))) with check (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur')));

drop policy if exists proformas_management on proformas;
create policy proformas_management on proformas for all using (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur'))) with check (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur')));

drop policy if exists proforma_items_management on proforma_items;
create policy proforma_items_management on proforma_items for all using (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur'))) with check (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur')));

drop policy if exists bl_management on bordereaux_livraison;
create policy bl_management on bordereaux_livraison for all using (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur'))) with check (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur')));

drop policy if exists bl_items_management on bordereau_items;
create policy bl_items_management on bordereau_items for all using (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur'))) with check (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur')));

drop policy if exists billing_counters_management on billing_counters;
create policy billing_counters_management on billing_counters for select using (exists(select 1 from profiles p where p.id=auth.uid() and p.role in ('admin','superviseur')));

revoke execute on function public.next_billing_number(text) from public, anon, authenticated;
grant execute on function public.next_billing_number(text) to authenticated;