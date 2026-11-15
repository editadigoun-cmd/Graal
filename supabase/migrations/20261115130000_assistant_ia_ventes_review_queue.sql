-- Assistant IA de ventes : zone de préparation isolée, validation humaine obligatoire.
create table if not exists public.imports_ventes_ia (
  id uuid primary key default gen_random_uuid(),
  grossiste_id uuid not null references public.grossistes(id),
  laboratoire_id uuid not null references public.laboratoires(id),
  fichier_nom text not null,
  fichier_path text not null,
  mois_reference date,
  statut text not null default 'en_attente' check (statut in ('en_attente','analyse','a_verifier','valide','rejete','erreur')),
  resume text,
  avertissements jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id),
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.lignes_import_ventes_ia (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports_ventes_ia(id) on delete cascade,
  numero_ligne integer not null,
  designation_source text not null,
  code_externe text,
  produit_id uuid references public.produits(id),
  ventes numeric(12,2),
  stock numeric(12,2),
  confiance numeric(5,4),
  avertissement text,
  created_at timestamptz not null default now(),
  unique(import_id, numero_ligne)
);
create index if not exists idx_imports_ventes_ia_statut on public.imports_ventes_ia(statut, created_at desc);
create index if not exists idx_lignes_import_ventes_ia_import on public.lignes_import_ventes_ia(import_id, numero_ligne);
alter table public.imports_ventes_ia enable row level security;
alter table public.lignes_import_ventes_ia enable row level security;
drop policy if exists imports_ventes_ia_admin_all on public.imports_ventes_ia;
create policy imports_ventes_ia_admin_all on public.imports_ventes_ia for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists lignes_import_ventes_ia_admin_all on public.lignes_import_ventes_ia;
create policy lignes_import_ventes_ia_admin_all on public.lignes_import_ventes_ia for all using (public.is_admin()) with check (public.is_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('imports-ventes-ia','imports-ventes-ia',false,20971520,array['text/csv','application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public=false, file_size_limit=20971520, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists imports_ventes_ia_storage_admin_insert on storage.objects;
create policy imports_ventes_ia_storage_admin_insert on storage.objects for insert to authenticated with check (bucket_id='imports-ventes-ia' and public.is_admin());
drop policy if exists imports_ventes_ia_storage_admin_select on storage.objects;
create policy imports_ventes_ia_storage_admin_select on storage.objects for select to authenticated using (bucket_id='imports-ventes-ia' and public.is_admin());
drop policy if exists imports_ventes_ia_storage_admin_delete on storage.objects;
create policy imports_ventes_ia_storage_admin_delete on storage.objects for delete to authenticated using (bucket_id='imports-ventes-ia' and public.is_admin());
