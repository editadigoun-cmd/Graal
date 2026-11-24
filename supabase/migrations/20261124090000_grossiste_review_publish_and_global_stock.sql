-- Publish reviewed grossiste snapshots into monthly sales, daily sales and stock tables.
-- The first approved capture establishes the month-to-date baseline; only later captures
-- generate daily deltas. Re-running approval is safe and does not duplicate weekly sales.

create table if not exists public.grossiste_ventes_integrations (
  id uuid primary key default gen_random_uuid(),
  grossiste_id uuid not null references public.grossistes(id) on delete cascade,
  code_externe text not null,
  produit_id uuid not null references public.produits(id) on delete cascade,
  mois_reference date not null,
  date_capture date not null,
  date_vente date not null,
  quantite numeric(14,3) not null check (quantite > 0),
  created_at timestamptz not null default now(),
  unique (grossiste_id, code_externe, mois_reference, date_capture)
);
create index if not exists grossiste_ventes_integrations_product_date_idx
  on public.grossiste_ventes_integrations(produit_id, date_vente);

alter table public.grossiste_ventes_integrations enable row level security;
drop policy if exists grossiste_ventes_integrations_admin_read on public.grossiste_ventes_integrations;
create policy grossiste_ventes_integrations_admin_read
  on public.grossiste_ventes_integrations for select to authenticated using (public.is_admin());
drop policy if exists grossiste_ventes_integrations_admin_write on public.grossiste_ventes_integrations;
create policy grossiste_ventes_integrations_admin_write
  on public.grossiste_ventes_integrations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.grossiste_ventes_integrations to authenticated;

create or replace view public.grossiste_ventes_mensuelles
with (security_invoker=true) as
with latest as (
  select distinct on (s.grossiste_id, s.code_externe, s.report_month)
    s.grossiste_id, s.code_externe, s.produit_id, s.report_month,
    s.cumulative_quantity, s.created_at
  from public.grossiste_sales_snapshots s
  where s.reviewed = true and s.produit_id is not null
    and s.cumulative_quantity is not null
  order by s.grossiste_id, s.code_externe, s.report_month, s.created_at desc, s.id desc
)
select grossiste_id, code_externe, produit_id, report_month,
       cumulative_quantity as quantite_cumulee, created_at
from latest;
-- A later approved capture on the same calendar day must replace an earlier automatic capture.
drop policy if exists "Admins update grossiste sales snapshots" on public.grossiste_ventes_snapshots;
create policy "Admins update grossiste sales snapshots"
  on public.grossiste_ventes_snapshots for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant update on public.grossiste_ventes_snapshots to authenticated;

grant select on public.grossiste_ventes_mensuelles to authenticated;

create or replace view public.grossiste_ventes_mensuelles_globales
with (security_invoker=true) as
select produit_id, report_month as mois_reference,
       sum(quantite_cumulee) as quantite_mois,
       count(distinct grossiste_id) as nombre_grossistes
from public.grossiste_ventes_mensuelles
group by produit_id, report_month;
grant select on public.grossiste_ventes_mensuelles_globales to authenticated;

create or replace view public.grossiste_stock_actuel
with (security_invoker=true) as
with latest as (
  select distinct on (s.grossiste_id, s.code_externe)
    s.grossiste_id, s.code_externe, s.produit_id, s.designation_source,
    s.report_month, s.stock_quantity, s.order_quantity, s.created_at
  from public.grossiste_sales_snapshots s
  where s.reviewed = true
    and (s.stock_quantity is not null or s.order_quantity is not null)
  order by s.grossiste_id, s.code_externe, s.created_at desc, s.id desc
)
select grossiste_id, code_externe, produit_id, designation_source,
       report_month, stock_quantity, order_quantity, created_at
from latest;
grant select on public.grossiste_stock_actuel to authenticated;

create or replace view public.grossiste_stock_global_par_produit
with (security_invoker=true) as
select produit_id,
       sum(coalesce(stock_quantity,0)) as stock_total,
       sum(coalesce(order_quantity,0)) as commandes_en_cours_total,
       count(distinct grossiste_id) as nombre_grossistes,
       max(created_at) as derniere_mise_a_jour
from public.grossiste_stock_actuel
where produit_id is not null
group by produit_id;
grant select on public.grossiste_stock_global_par_produit to authenticated;

create or replace function public.approve_grossiste_sync_run(p_sync_run_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.grossiste_sync_runs%rowtype;
  v_capture_date date;
  v_month date;
  v_daily_rows integer := 0;
  v_stock_rows integer := 0;
  v_posted_rows integer := 0;
  v_weekly_rows integer := 0;
  v_unmapped_rows integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Accès administrateur requis pour valider un relevé grossiste';
  end if;

  select * into v_run
  from public.grossiste_sync_runs
  where id = p_sync_run_id
  for update;

  if not found then
    raise exception 'Synchronisation grossiste introuvable';
  end if;

  if exists (
    select 1 from public.grossiste_sync_preview_pages
    where sync_run_id = p_sync_run_id and review_status <> 'approved'
  ) then
    raise exception 'Toutes les pages du relevé doivent être validées avant intégration';
  end if;

  v_capture_date := (v_run.started_at at time zone 'Africa/Porto-Novo')::date;
  v_month := coalesce(v_run.report_month, date_trunc('month', v_capture_date)::date);

  -- Persist product matches at the snapshot level so reporting views can join reliably.
  update public.grossiste_sales_snapshots s
  set produit_id = m.produit_id,
      reviewed = true
  from public.mappings_produits_grossistes m
  where s.sync_run_id = p_sync_run_id
    and s.grossiste_id = m.grossiste_id
    and s.code_externe = m.code_externe;

  select count(*) into v_unmapped_rows
  from public.grossiste_sales_snapshots
  where sync_run_id = p_sync_run_id
    and code_externe is not null
    and cumulative_quantity is not null
    and produit_id is null;

  if v_unmapped_rows > 0 then
    raise exception 'Validation bloquée : % référence(s) ne sont pas associées à un produit du catalogue et à son laboratoire.', v_unmapped_rows;
  end if;

  update public.grossiste_sales_snapshots
  set reviewed = true
  where sync_run_id = p_sync_run_id;

  -- Every approved cumulative quantity becomes a dated snapshot. If a second,
  -- later capture is approved on the same day, it replaces the earlier capture.
  -- Re-approving the same run remains idempotent.
  insert into public.grossiste_ventes_snapshots
    (grossiste_id, code_externe, produit_source, mois_reference, date_capture,
     cumul_mois, raw_row, created_at)
  select s.grossiste_id, s.code_externe, s.designation_source, v_month,
         v_capture_date, s.cumulative_quantity,
         jsonb_build_object(
           'source', 'grossiste_sales_snapshots',
           'sync_run_id', s.sync_run_id,
           'source_snapshot_id', s.id,
           'stock_quantity', s.stock_quantity,
           'order_quantity', s.order_quantity,
           'source_row', s.source_row
         ),
         s.created_at
  from public.grossiste_sales_snapshots s
  where s.sync_run_id = p_sync_run_id
    and s.code_externe is not null
    and s.cumulative_quantity is not null
  on conflict (grossiste_id, code_externe, mois_reference, date_capture)
  do update set produit_source = excluded.produit_source,
                cumul_mois = excluded.cumul_mois,
                raw_row = excluded.raw_row,
                created_at = excluded.created_at
  where excluded.created_at > public.grossiste_ventes_snapshots.created_at;
  get diagnostics v_daily_rows = row_count;

  -- Replace the weekly stock point with the latest approved stock for that week.
  insert into public.stocks_hebdomadaires
    (produit_id, grossiste_id, semaine_debut, quantite, created_by)
  select s.produit_id, s.grossiste_id,
         date_trunc('week', v_capture_date)::date,
         s.stock_quantity, auth.uid()
  from public.grossiste_sales_snapshots s
  where s.sync_run_id = p_sync_run_id
    and s.produit_id is not null
    and s.stock_quantity is not null
  on conflict (produit_id, grossiste_id, semaine_debut)
  do update set quantite = excluded.quantite, updated_at = now();
  get diagnostics v_stock_rows = row_count;

  -- Only a new dated product delta is posted to weekly sales. Baselines, capture gaps,
  -- and already-integrated snapshots never create a second sale.
  with inserted_postings as (
    insert into public.grossiste_ventes_integrations
      (grossiste_id, code_externe, produit_id, mois_reference,
       date_capture, date_vente, quantite)
    select d.grossiste_id, d.code_externe, d.produit_id, d.mois_reference,
           d.date_capture, d.date_vente, d.ventes_jour_precedent
    from public.grossiste_ventes_journalieres d
    where d.grossiste_id = v_run.grossiste_id
      and d.mois_reference = v_month
      and d.date_capture = v_capture_date
      and d.status = 'calculated'
      and d.produit_id is not null
      and coalesce(d.ventes_jour_precedent,0) > 0
    on conflict (grossiste_id, code_externe, mois_reference, date_capture) do nothing
    returning produit_id, grossiste_id, date_vente, quantite
  ),
  totals as (
    select produit_id, grossiste_id,
           date_trunc('week', date_vente)::date as semaine_debut,
           sum(quantite) as quantite
    from inserted_postings
    group by produit_id, grossiste_id, date_trunc('week', date_vente)::date
  ),
  weekly_upsert as (
    insert into public.ventes_hebdomadaires
      (produit_id, grossiste_id, semaine_debut, quantite, created_by)
    select produit_id, grossiste_id, semaine_debut, quantite, auth.uid()
    from totals
    on conflict (produit_id, grossiste_id, semaine_debut)
    do update set quantite = public.ventes_hebdomadaires.quantite + excluded.quantite,
                  updated_at = now()
    returning 1
  )
  select (select count(*) from inserted_postings),
         (select count(*) from weekly_upsert)
    into v_posted_rows, v_weekly_rows;

  update public.grossiste_sync_runs
  set status = 'success',
      finished_at = coalesce(finished_at, now()),
      summary = coalesce(summary,'') ||
        case when coalesce(summary,'') = '' then '' else ' ' end ||
        'Relevé validé et intégré : ventes cumulées, écarts journaliers et stocks publiés.'
  where id = p_sync_run_id;

  return jsonb_build_object(
    'run_id', p_sync_run_id,
    'capture_date', v_capture_date,
    'month_reference', v_month,
    'daily_snapshots_inserted', v_daily_rows,
    'weekly_stock_rows_upserted', v_stock_rows,
    'daily_sales_postings_inserted', v_posted_rows,
    'weekly_sales_rows_upserted', v_weekly_rows
  );
end;
$$;

grant execute on function public.approve_grossiste_sync_run(uuid) to authenticated;
