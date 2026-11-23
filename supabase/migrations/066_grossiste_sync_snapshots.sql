-- 066: historique des synchronisations automatiques de grossistes et snapshots mensuels cumulés.
-- Les secrets de connexion restent exclusivement dans Cloudflare Worker Secrets, jamais en base.
create table if not exists public.grossiste_sync_runs (
  id uuid primary key default gen_random_uuid(),
  grossiste_id uuid not null references public.grossistes(id),
  source text not null check (source in ('browser','email','upload','manual')),
  status text not null check (status in ('queued','running','success','partial','failed','needs_human')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  report_month date check (report_month is null or report_month = date_trunc('month', report_month)::date),
  rows_found integer not null default 0 check (rows_found >= 0),
  rows_matched integer not null default 0 check (rows_matched >= 0),
  rows_unmatched integer not null default 0 check (rows_unmatched >= 0),
  source_file_name text,
  source_file_hash text,
  summary text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_grossiste_sync_runs_grossiste_date on public.grossiste_sync_runs(grossiste_id, started_at desc);
create index if not exists idx_grossiste_sync_runs_status on public.grossiste_sync_runs(status, started_at desc);

create table if not exists public.grossiste_sales_snapshots (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.grossiste_sync_runs(id) on delete cascade,
  grossiste_id uuid not null references public.grossistes(id),
  produit_id uuid references public.produits(id),
  code_externe text,
  designation_source text not null,
  report_month date not null check (report_month = date_trunc('month', report_month)::date),
  cumulative_quantity numeric(14,3),
  cumulative_revenue numeric(14,2),
  stock_quantity numeric(14,3),
  order_quantity numeric(14,3),
  source_row jsonb not null default '{}'::jsonb,
  match_confidence numeric(5,4) check (match_confidence is null or match_confidence between 0 and 1),
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_grossiste_sales_snapshots_month_product on public.grossiste_sales_snapshots(grossiste_id, report_month, produit_id, created_at desc);
create index if not exists idx_grossiste_sales_snapshots_run on public.grossiste_sales_snapshots(sync_run_id);

alter table public.grossiste_sync_runs enable row level security;
alter table public.grossiste_sales_snapshots enable row level security;
drop policy if exists grossiste_sync_runs_admin_select on public.grossiste_sync_runs;
create policy grossiste_sync_runs_admin_select on public.grossiste_sync_runs for select using (public.is_admin());
drop policy if exists grossiste_sync_runs_admin_write on public.grossiste_sync_runs;
create policy grossiste_sync_runs_admin_write on public.grossiste_sync_runs for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists grossiste_sales_snapshots_admin_select on public.grossiste_sales_snapshots;
create policy grossiste_sales_snapshots_admin_select on public.grossiste_sales_snapshots for select using (public.is_admin());
drop policy if exists grossiste_sales_snapshots_admin_write on public.grossiste_sales_snapshots;
create policy grossiste_sales_snapshots_admin_write on public.grossiste_sales_snapshots for all using (public.is_admin()) with check (public.is_admin());

comment on table public.grossiste_sync_runs is 'Audit des récupérations automatiques/manuelles de rapports grossistes; aucun secret de portail n’est stocké ici.';
comment on table public.grossiste_sales_snapshots is 'Snapshots des cumuls par mois, conservés séparément pour calculer les deltas sans additionner les cumuls.';
