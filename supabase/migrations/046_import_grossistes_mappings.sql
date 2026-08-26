-- 046: Persistance du mappage produit ↔ code externe par grossiste, pour l'import hebdomadaire
-- automatisé des relevés de ventes/stock (CSV PROMO/UBI PHARM, PDF GAPOB/UBPHAR). Une fois un
-- produit mappé une semaine, les imports suivants du même grossiste le reconnaissent automatiquement
-- (code CIP/EAN/Référence selon le grossiste, ou désignation normalisée pour GAPOB qui n'expose
-- aucun code produit).

create table public.mappings_produits_grossistes (
  id uuid primary key default gen_random_uuid(),
  grossiste_id uuid not null references public.grossistes(id) on delete cascade,
  code_externe text not null,
  produit_id uuid not null references public.produits(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (grossiste_id, code_externe)
);

create index idx_mappings_produits_grossistes_produit on public.mappings_produits_grossistes(produit_id);

alter table public.mappings_produits_grossistes enable row level security;

create policy mappings_produits_grossistes_select on public.mappings_produits_grossistes for select
  using (public.is_admin() or public.is_superviseur());
create policy mappings_produits_grossistes_write on public.mappings_produits_grossistes for all
  using (public.is_admin() or public.is_superviseur()) with check (public.is_admin() or public.is_superviseur());
