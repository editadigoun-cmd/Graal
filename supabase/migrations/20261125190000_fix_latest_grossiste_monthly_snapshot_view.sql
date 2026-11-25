-- Make monthly grossiste statistics read the latest validated daily cumulative snapshot.
-- The daily validation flow writes to grossiste_ventes_snapshots; the previous view
-- read grossiste_sales_snapshots instead, so the dashboard kept showing yesterday's
-- cumulative figures after a newer daily report had been published.

create or replace view public.grossiste_ventes_mensuelles as
with latest as (
  select distinct on (s.grossiste_id,s.code_externe,s.mois_reference)
    s.grossiste_id,
    s.code_externe,
    m.produit_id,
    s.mois_reference as report_month,
    s.cumul_mois::numeric(14,3) as quantite_cumulee,
    s.created_at
  from public.grossiste_ventes_snapshots s
  join public.mappings_produits_grossistes m
    on m.grossiste_id=s.grossiste_id
   and m.code_externe=s.code_externe
  where s.cumul_mois is not null
  order by s.grossiste_id,s.code_externe,s.mois_reference,
           s.date_capture desc,s.created_at desc,s.id desc
)
select grossiste_id,code_externe,produit_id,report_month,quantite_cumulee,created_at
from latest;
