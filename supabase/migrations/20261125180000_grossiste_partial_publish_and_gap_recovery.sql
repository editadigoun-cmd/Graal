-- Partial publication: integrate mapped products while keeping unresolved references visible.
-- Recover all newly calculable daily deltas after an intermediate capture is approved.
-- Unique integration keys preserve idempotency across repeated validations.

create or replace function public.approve_grossiste_sync_run(p_sync_run_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_run public.grossiste_sync_runs%rowtype;
  v_capture_date date;
  v_latest_capture_date date;
  v_month date;
  v_daily_rows integer := 0;
  v_stock_rows integer := 0;
  v_posted_rows integer := 0;
  v_weekly_rows integer := 0;
  v_published_dates integer := 0;
  v_unmapped_rows integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Accès administrateur requis pour valider un relevé grossiste';
  end if;

  select * into v_run from public.grossiste_sync_runs where id = p_sync_run_id for update;
  if not found then raise exception 'Synchronisation grossiste introuvable'; end if;

  if exists (select 1 from public.grossiste_sync_preview_pages
             where sync_run_id = p_sync_run_id and review_status <> 'approved') then
    raise exception 'Toutes les pages du relevé doivent être validées avant intégration';
  end if;

  v_capture_date := (v_run.started_at at time zone 'Africa/Porto-Novo')::date;
  v_month := coalesce(v_run.report_month, date_trunc('month', v_capture_date)::date);

  update public.grossiste_sales_snapshots s
  set produit_id = m.produit_id
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

  update public.grossiste_sales_snapshots
  set reviewed = (produit_id is not null or cumulative_quantity is null)
  where sync_run_id = p_sync_run_id;

  insert into public.grossiste_ventes_snapshots
    (grossiste_id, code_externe, produit_source, mois_reference, date_capture, cumul_mois, raw_row, created_at)
  select s.grossiste_id, s.code_externe, s.designation_source, v_month, v_capture_date, s.cumulative_quantity,
         jsonb_build_object('source','grossiste_sales_snapshots','sync_run_id',s.sync_run_id,
           'source_snapshot_id',s.id,'stock_quantity',s.stock_quantity,'order_quantity',s.order_quantity,
           'source_row',s.source_row), s.created_at
  from public.grossiste_sales_snapshots s
  where s.sync_run_id = p_sync_run_id and s.code_externe is not null and s.cumulative_quantity is not null
  on conflict (grossiste_id, code_externe, mois_reference, date_capture)
  do update set produit_source=excluded.produit_source,cumul_mois=excluded.cumul_mois,
                raw_row=excluded.raw_row,created_at=excluded.created_at
  where excluded.created_at > public.grossiste_ventes_snapshots.created_at;
  get diagnostics v_daily_rows = row_count;

  insert into public.stocks_hebdomadaires
    (produit_id,grossiste_id,semaine_debut,quantite,created_by)
  select s.produit_id,s.grossiste_id,date_trunc('week',v_capture_date)::date,s.stock_quantity,auth.uid()
  from public.grossiste_sales_snapshots s
  where s.sync_run_id=p_sync_run_id and s.produit_id is not null and s.stock_quantity is not null
  on conflict (produit_id,grossiste_id,semaine_debut)
  do update set quantite=excluded.quantite,updated_at=now();
  get diagnostics v_stock_rows = row_count;

  select max(date_capture) into v_latest_capture_date
  from public.grossiste_ventes_snapshots
  where grossiste_id=v_run.grossiste_id and mois_reference=v_month;

  with inserted_postings as (
    insert into public.grossiste_ventes_integrations
      (grossiste_id,code_externe,produit_id,mois_reference,date_capture,date_vente,quantite)
    select d.grossiste_id,d.code_externe,d.produit_id,d.mois_reference,d.date_capture,d.date_vente,d.ventes_jour_precedent
    from public.grossiste_ventes_journalieres d
    where d.grossiste_id=v_run.grossiste_id
      and d.mois_reference=v_month
      and d.date_capture<=coalesce(v_latest_capture_date,v_capture_date)
      and d.status='calculated' and d.produit_id is not null
      and coalesce(d.ventes_jour_precedent,0)>0
    on conflict (grossiste_id,code_externe,mois_reference,date_capture) do nothing
    returning produit_id,grossiste_id,date_vente,date_capture,quantite
  ),
  totals as (
    select produit_id,grossiste_id,date_trunc('week',date_vente)::date as semaine_debut,sum(quantite) as quantite
    from inserted_postings
    group by produit_id,grossiste_id,date_trunc('week',date_vente)::date
  ),
  weekly_upsert as (
    insert into public.ventes_hebdomadaires(produit_id,grossiste_id,semaine_debut,quantite,created_by)
    select produit_id,grossiste_id,semaine_debut,quantite,auth.uid() from totals
    on conflict (produit_id,grossiste_id,semaine_debut)
    do update set quantite=public.ventes_hebdomadaires.quantite+excluded.quantite,updated_at=now()
    returning 1
  )
  select (select count(*) from inserted_postings),
         (select count(*) from weekly_upsert),
         (select count(distinct date_capture) from inserted_postings)
  into v_posted_rows,v_weekly_rows,v_published_dates;

  update public.grossiste_sync_runs
  set status=case when v_unmapped_rows>0 then 'needs_human' else 'success' end,
      finished_at=coalesce(finished_at,now()),
      summary=coalesce(nullif(split_part(coalesce(summary,''),' | Validation ',1),''),'Collecte grossiste.')
        || ' | Validation '
        || case when v_unmapped_rows>0
          then 'partielle : '||v_posted_rows||' lignes de ventes intégrées; '||v_unmapped_rows||' référence(s) restent à associer.'
          else 'terminée : toutes les références sont associées et les ventes calculées sont intégrées.'
        end
  where id=p_sync_run_id;

  return jsonb_build_object('run_id',p_sync_run_id,'capture_date',v_capture_date,'month_reference',v_month,
    'daily_snapshots_inserted',v_daily_rows,'weekly_stock_rows_upserted',v_stock_rows,
    'daily_sales_postings_inserted',v_posted_rows,'weekly_sales_rows_upserted',v_weekly_rows,
    'daily_capture_dates_published',v_published_dates,'unmapped_rows_skipped',v_unmapped_rows);
end;
$function$;

grant execute on function public.approve_grossiste_sync_run(uuid) to authenticated;
