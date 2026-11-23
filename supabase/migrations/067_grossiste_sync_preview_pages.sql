-- 067: raw portal preview pages retained for admin review only.
create table if not exists public.grossiste_sync_preview_pages (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.grossiste_sync_runs(id) on delete cascade,
  page_order integer not null default 0,
  page_url text not null,
  page_title text,
  page_kind text not null default 'html',
  extracted_payload jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(sync_run_id,page_order)
);
create index if not exists idx_grossiste_sync_preview_run on public.grossiste_sync_preview_pages(sync_run_id,page_order);
alter table public.grossiste_sync_preview_pages enable row level security;
drop policy if exists grossiste_sync_preview_admin_select on public.grossiste_sync_preview_pages;
create policy grossiste_sync_preview_admin_select on public.grossiste_sync_preview_pages for select using (public.is_admin());
drop policy if exists grossiste_sync_preview_admin_write on public.grossiste_sync_preview_pages;
create policy grossiste_sync_preview_admin_write on public.grossiste_sync_preview_pages for all using (public.is_admin()) with check (public.is_admin());
comment on table public.grossiste_sync_preview_pages is 'Pages brutes extraites du portail grossiste en staging; réservées à la revue Admin, sans intégration commerciale automatique.';
