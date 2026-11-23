-- Daily cumulative grossiste sales snapshots; sales are attributed to the previous day.
create table if not exists public.grossiste_ventes_snapshots (
 id uuid primary key default gen_random_uuid(),
 grossiste_id uuid not null references public.grossistes(id) on delete cascade,
 code_externe text not null,
 produit_source text not null,
 mois_reference date not null,
 date_capture date not null,
 cumul_mois numeric not null check (cumul_mois >= 0),
 raw_row jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(grossiste_id,code_externe,mois_reference,date_capture)
);
alter table public.grossiste_ventes_snapshots enable row level security;
drop policy if exists "Admins read grossiste sales snapshots" on public.grossiste_ventes_snapshots;
create policy "Admins read grossiste sales snapshots" on public.grossiste_ventes_snapshots for select to authenticated using (public.is_admin());
grant select on public.grossiste_ventes_snapshots to authenticated;
create index if not exists grossiste_ventes_snapshots_month_date_idx on public.grossiste_ventes_snapshots(grossiste_id,mois_reference,date_capture);
create or replace view public.grossiste_ventes_journalieres with (security_invoker=true) as
select s.grossiste_id,s.code_externe,m.produit_id,s.produit_source,s.mois_reference,
 s.date_capture - 1 as date_vente,
 s.cumul_mois as cumul_capture,
 lag(s.cumul_mois) over(partition by s.grossiste_id,s.code_externe,s.mois_reference order by s.date_capture) as cumul_precedent,
 case when lag(s.cumul_mois) over(partition by s.grossiste_id,s.code_externe,s.mois_reference order by s.date_capture) is null then null
      when s.cumul_mois < lag(s.cumul_mois) over(partition by s.grossiste_id,s.code_externe,s.mois_reference order by s.date_capture) then null
      else s.cumul_mois - lag(s.cumul_mois) over(partition by s.grossiste_id,s.code_externe,s.mois_reference order by s.date_capture) end as ventes_jour_precedent,
 case when lag(s.cumul_mois) over(partition by s.grossiste_id,s.code_externe,s.mois_reference order by s.date_capture) is null then 'baseline'
      when s.cumul_mois < lag(s.cumul_mois) over(partition by s.grossiste_id,s.code_externe,s.mois_reference order by s.date_capture) then 'cumul_decreased'
      else 'calculated' end as status
from public.grossiste_ventes_snapshots s
left join public.mappings_produits_grossistes m on m.grossiste_id=s.grossiste_id and m.code_externe=s.code_externe;
grant select on public.grossiste_ventes_journalieres to authenticated;
