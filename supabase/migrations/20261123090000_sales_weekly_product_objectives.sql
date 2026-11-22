-- Objectifs de quantité saisis par produit et par semaine (facultatifs).
create table if not exists public.objectifs_hebdomadaires_produits (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  semaine_debut date not null,
  objectif_quantite numeric(10,2) not null check (objectif_quantite >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (produit_id, semaine_debut)
);
alter table public.objectifs_hebdomadaires_produits enable row level security;
drop policy if exists objectifs_hebdo_admin_all on public.objectifs_hebdomadaires_produits;
create policy objectifs_hebdo_admin_all on public.objectifs_hebdomadaires_produits
for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.actif = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.actif = true));
comment on table public.objectifs_hebdomadaires_produits is 'Objectifs facultatifs de vente par produit et par semaine.';
