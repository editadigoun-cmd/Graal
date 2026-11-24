create or replace view public.v_evaluation_superviseurs_mensuelle as
with cfg as (
  select
    coalesce((select (value->>'vad_quota')::numeric from public.parametres where key='evaluation_superviseurs_poids'),25) as w_vad,
    coalesce((select (value->>'qualite_duo')::numeric from public.parametres where key='evaluation_superviseurs_poids'),25) as w_duo,
    coalesce((select (value->>'prospection')::numeric from public.parametres where key='evaluation_superviseurs_poids'),20) as w_prospection,
    coalesce((select (value->>'staffs')::numeric from public.parametres where key='evaluation_superviseurs_poids'),15) as w_staffs,
    coalesce((select (value->>'rapports_mensuels')::numeric from public.parametres where key='evaluation_superviseurs_poids'),15) as w_reports
), periode as (
  select date_trunc('month', current_date)::date as debut,(date_trunc('month',current_date)+interval '1 month')::date as fin
), weeks as (
  select count(distinct date_trunc('week',g.d))::integer*3 as target
  from periode p,generate_series(p.debut::timestamp,(p.fin-interval '1 day')::timestamp,interval '1 day') g(d)
), sup as (
  select id,full_name from public.profiles where role='superviseur' and actif=true
), vm_counts as (
  select se.superviseur_id,count(distinct vm.id)::integer as vm_count
  from public.superviseur_equipes se join public.profiles vm on vm.equipe_id=se.equipe_id and vm.role='vm' and vm.actif=true group by se.superviseur_id
), quotas as (
  select q.superviseur_id,coalesce(sum(q.jours),0)::integer as vad_objectif
  from public.vad_duo_quotas_mensuels q,periode p where q.mois=p.debut and q.statut='VALIDE' group by q.superviseur_id
), duos as (
  select d.superviseur_id,count(*) filter(where d.statut='TERMINE')::integer as duos_realises
  from public.vad_duo_journaliers d,periode p where d.jour>=p.debut and d.jour<p.fin group by d.superviseur_id
), qual as (
  select r.superviseur_id,round(avg((coalesce(r.preparation_visite::integer,0)+coalesce(r.utilisation_argumentaire::integer,0)+coalesce(r.gestion_objections::integer,0)+coalesce(r.obtention_engagement::integer,0)+coalesce(r.posture_professionnelle::integer,0)+coalesce(r.presence_terrain::integer,0))::numeric/6/5*100),2) as qualite_duo_pct
  from public.rapports_duo r,periode p where r.jour>=p.debut and r.jour<p.fin group by r.superviseur_id
), pros as (
  select se.superviseur_id,count(distinct pf.client_id)::integer as total_clients,
    count(distinct pf.client_id) filter(where c.updated_at>=p.debut and c.updated_at<p.fin)::integer as clients_maj
  from public.superviseur_equipes se join public.profiles vm on vm.equipe_id=se.equipe_id and vm.role='vm' and vm.actif=true
  join public.portefeuille pf on pf.vm_id=vm.id join public.clients c on c.id=pf.client_id and c.actif=true cross join periode p group by se.superviseur_id
), eval as (
  select e.* from public.evaluations_superviseurs_mensuelles e,periode p where e.mois=p.debut
)
select s.id as superviseur_id,s.full_name,p.debut as mois,coalesce(vc.vm_count,0) as vm_count,
  coalesce(q.vad_objectif,0) as vad_objectif,coalesce(d.duos_realises,0) as vad_realises,
  case when coalesce(q.vad_objectif,0)=0 then 0 else least(100,round(coalesce(d.duos_realises,0)::numeric/q.vad_objectif*100,2)) end as vad_quota_pct,
  coalesce(qu.qualite_duo_pct,0) as qualite_duo_pct,coalesce(pr.total_clients,0) as clients_total,coalesce(pr.clients_maj,0) as clients_maj,
  case when coalesce(pr.total_clients,0)=0 then 100 else round(pr.clients_maj::numeric/pr.total_clients*100,2) end as prospection_pct,
  coalesce(e.staffs_realises,0) as staffs_realises,(select target from weeks) as staffs_objectif,
  coalesce(e.rapport_mensuel_score,0)::integer as rapport_mensuel_score,e.appreciation,e.recommandations,
  round((case when coalesce(q.vad_objectif,0)=0 then 0 else least(100,coalesce(d.duos_realises,0)::numeric/q.vad_objectif*100) end)*(select w_vad from cfg)/100
    +coalesce(qu.qualite_duo_pct,0)*(select w_duo from cfg)/100
    +(case when coalesce(pr.total_clients,0)=0 then 100 else pr.clients_maj::numeric/pr.total_clients*100 end)*(select w_prospection from cfg)/100
    +least(100,coalesce(e.staffs_realises,0)::numeric/greatest(1,(select target from weeks))*100)*(select w_staffs from cfg)/100
    +coalesce(e.rapport_mensuel_score,0)::numeric/5*100*(select w_reports from cfg)/100,2) as note_finale
from sup s cross join periode p left join vm_counts vc on vc.superviseur_id=s.id
left join quotas q on q.superviseur_id=s.id left join duos d on d.superviseur_id=s.id
left join qual qu on qu.superviseur_id=s.id left join pros pr on pr.superviseur_id=s.id
left join eval e on e.superviseur_id=s.id;