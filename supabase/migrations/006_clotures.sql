-- 006: clôtures journalières + stockage des photos de fiches papier

create table public.clotures_journalieres (
  id uuid primary key default gen_random_uuid(),
  vm_id uuid not null references public.profiles(id) on delete cascade,
  jour date not null,
  statut statut_cloture not null default 'EN_ATTENTE',
  heure_cloture timestamptz,
  photo_path text,
  photo_horodatage timestamptz,
  photo_latitude double precision,
  photo_longitude double precision,
  en_retard boolean not null default false,
  created_at timestamptz not null default now(),
  unique (vm_id, jour)
);

create index clotures_jour_idx on public.clotures_journalieres(jour);

-- Bucket privé pour les photos des fiches papier (accès via URL signée uniquement)
insert into storage.buckets (id, name, public)
values ('fiches-papier', 'fiches-papier', false)
on conflict (id) do nothing;
