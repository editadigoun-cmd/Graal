-- Keep daily attribution reliable when collection days are missed.
drop view if exists public.grossiste_ventes_journalieres;
create view public.grossiste_ventes_journalieres with (security_invoker=true) as
with ordered as (
 select s.*,m.produit_id,
 lag(s.cumul_mois) over(partition by s.grossiste_id,s.code_externe,s.mois_reference order by s.date_capture) as cumul_precedent,
 lag(s.date_capture) over(partition by s.grossiste_id,s.code_externe,s.mois_reference order by s.date_capture) as date_capture_precedente
 from public.grossiste_ventes_snapshots s
 left join public.mappings_produits_grossistes m on m.grossiste_id=s.grossiste_id and m.code_externe=s.code_externe
)
select grossiste_id,code_externe,produit_id,produit_source,mois_reference,date_capture,
 date_capture-1 as date_vente,cumul_mois as cumul_capture,cumul_precedent,date_capture_precedente,
 case when cumul_precedent is null or cumul_mois<cumul_precedent then null else cumul_mois-cumul_precedent end as ventes_intervalle,
 case when cumul_precedent is null or cumul_mois<cumul_precedent or date_capture_precedente<>date_capture-1 then null else cumul_mois-cumul_precedent end as ventes_jour_precedent,
 case when cumul_precedent is null then 'baseline'
      when cumul_mois<cumul_precedent then 'cumul_decreased'
      when date_capture_precedente<>date_capture-1 then 'capture_gap'
      else 'calculated' end as status
from ordered;
grant select on public.grossiste_ventes_journalieres to authenticated;
