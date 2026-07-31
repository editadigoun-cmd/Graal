-- 012: vues et fonctions d'évaluation — calculs automatiques, sans ressaisie.

create or replace function public.points_potentiel(p potentiel_client)
returns numeric language sql immutable as $$
  select case p when 'GROS' then 4 when 'MOYEN' then 1.5 when 'FAIBLE' then 0.5 end;
$$;

-- Lignes du programme enrichies de leur statut réel (réalisée / non faite / en attente)
create or replace view public.v_lignes_avec_statut as
select
  pl.id as programme_ligne_id,
  ph.id as programme_id,
  ph.vm_id,
  ph.semaine_debut,
  pl.jour,
  (ph.semaine_debut + public.jour_offset(pl.jour)) as date_visite,
  pl.client_id,
  c.nom as client_nom,
  c.potentiel,
  c.specialite,
  pl.type_visite,
  ph.statut as programme_statut,
  v.id as visite_id,
  coalesce(v.statut::text,
    case when mvm.id is not null then 'NON_FAITE' else 'EN_ATTENTE' end
  ) as statut_reel
from public.programme_lignes pl
join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
join public.clients c on c.id = pl.client_id
left join public.visites v on v.programme_ligne_id = pl.id
left join public.visite_manquante_motifs mvm on mvm.programme_ligne_id = pl.id;

create or replace view public.v_taux_realisation_journalier as
select vm_id, date_visite as jour,
  count(*) as visites_prevues,
  count(*) filter (where statut_reel = 'REALISEE') as visites_realisees,
  round(count(*) filter (where statut_reel = 'REALISEE')::numeric / nullif(count(*), 0), 4) as taux_realisation
from public.v_lignes_avec_statut
where programme_statut in ('VALIDE', 'VERROUILLE')
group by vm_id, date_visite;

create or replace view public.v_taux_realisation_hebdomadaire as
select vm_id, semaine_debut,
  public.cible_pour_specialite(specialite) as cible,
  count(*) as prevues,
  count(*) filter (where statut_reel = 'REALISEE') as realisees,
  round(count(*) filter (where statut_reel = 'REALISEE')::numeric / nullif(count(*), 0), 4) as taux
from public.v_lignes_avec_statut
where programme_statut in ('VALIDE', 'VERROUILLE')
group by vm_id, semaine_debut, public.cible_pour_specialite(specialite);

create or replace view public.v_hors_programme_journalier as
select vm_id, jour, count(*) as nb_hors_programme
from public.visites where hors_programme
group by vm_id, jour;

-- Score de qualité de couverture (points par potentiel + pénalité de déséquilibre en défaveur des GROS)
create or replace view public.v_score_couverture_vm as
with points as (
  select v.vm_id,
    sum(public.points_potentiel(c.potentiel)) as score_brut,
    sum(public.points_potentiel(c.potentiel)) filter (where c.potentiel = 'GROS') as points_gros,
    sum(public.points_potentiel(c.potentiel)) filter (where c.potentiel in ('MOYEN', 'FAIBLE')) as points_moyen_faible,
    count(*) filter (where c.potentiel = 'GROS') as nb_gros_visites
  from public.visites v
  join public.clients c on c.id = v.client_id
  where v.statut = 'REALISEE'
  group by v.vm_id
),
portefeuille_gros as (
  select vm_id, count(*) as nb_gros_portefeuille
  from public.portefeuille p join public.clients c on c.id = p.client_id
  where c.potentiel = 'GROS' and c.actif
  group by vm_id
)
select
  pts.vm_id,
  coalesce(pts.score_brut, 0) as score_brut,
  coalesce(pts.nb_gros_visites, 0) as nb_gros_visites,
  coalesce(pg.nb_gros_portefeuille, 0) as nb_gros_portefeuille,
  case when coalesce(pg.nb_gros_portefeuille, 0) = 0 then null
       else round(pts.nb_gros_visites::numeric / pg.nb_gros_portefeuille, 4) end as ratio_gros_couverts,
  case
    when coalesce(pg.nb_gros_portefeuille, 0) > 0
      and coalesce(pts.nb_gros_visites, 0)::numeric / pg.nb_gros_portefeuille < public.parametre_numeric('ratio_gros_minimum', 0.5)
      and coalesce(pts.points_moyen_faible, 0) > coalesce(pts.points_gros, 0)
    then round(pts.score_brut * (1 - public.parametre_numeric('penalite_desequilibre_pourcentage', 20) / 100.0), 2)
    else coalesce(pts.score_brut, 0)
  end as score_pondere
from portefeuille_gros pg
full outer join points pts on pts.vm_id = pg.vm_id;

-- Respect de la fréquence de visite mensuelle attendue, par client (section 3.2)
create or replace view public.v_client_frequence as
select
  c.id as client_id,
  c.nom,
  c.potentiel,
  c.secteur,
  c.frequence_visite_mensuelle,
  p.vm_id,
  max(v.jour) as derniere_visite,
  count(v.id) filter (where v.jour >= date_trunc('month', public.benin_today())::date) as visites_mois_courant,
  (count(v.id) filter (where v.jour >= date_trunc('month', public.benin_today())::date) >= c.frequence_visite_mensuelle) as frequence_respectee,
  case when max(v.jour) is null then null
    else (max(v.jour) + make_interval(days => (30 / greatest(c.frequence_visite_mensuelle, 1))))::date
  end as prochaine_visite_due
from public.clients c
left join public.portefeuille p on p.client_id = c.id
left join public.visites v on v.client_id = c.id and v.statut = 'REALISEE'
where c.actif
group by c.id, c.nom, c.potentiel, c.secteur, c.frequence_visite_mensuelle, p.vm_id;

-- Score mensuel composite de respect des règles de fonctionnement (objectif >= 90%)
create or replace function public.score_mensuel_vm(p_vm_id uuid, p_mois date)
returns table (
  vm_id uuid, mois date,
  taux_couverture numeric, ponctualite numeric, execution_planning numeric, discipline_clotures numeric,
  score_global numeric
) language sql stable as $$
  with periode as (
    select date_trunc('month', p_mois)::date as debut, (date_trunc('month', p_mois) + interval '1 month')::date as fin
  ),
  couverture as (
    select avg(case when frequence_respectee then 1 else 0 end) as taux
    from public.v_client_frequence where vm_id = p_vm_id
  ),
  ponctu as (
    select avg(case when soumis_at is not null and soumis_at <= (((semaine_debut - 4) + time '21:00') at time zone 'Africa/Porto-Novo') then 1 else 0 end) as taux
    from public.programmes_hebdomadaires, periode
    where vm_id = p_vm_id and semaine_debut >= periode.debut and semaine_debut < periode.fin
  ),
  execution as (
    select avg(taux_realisation) as taux
    from public.v_taux_realisation_journalier, periode
    where vm_id = p_vm_id and jour >= periode.debut and jour < periode.fin
  ),
  discipline as (
    select avg(case when statut = 'CLOTUREE' and not en_retard then 1 else 0 end) as taux
    from public.clotures_journalieres, periode
    where vm_id = p_vm_id and jour >= periode.debut and jour < periode.fin
  )
  select
    p_vm_id, periode.debut,
    round(coalesce((select taux from couverture), 1) * 100, 2),
    round(coalesce((select taux from ponctu), 1) * 100, 2),
    round(coalesce((select taux from execution), 1) * 100, 2),
    round(coalesce((select taux from discipline), 1) * 100, 2),
    round(
      coalesce((select taux from couverture), 1) * 30
      + coalesce((select taux from ponctu), 1) * 15
      + coalesce((select taux from execution), 1) * 30
      + coalesce((select taux from discipline), 1) * 25,
      2
    )
  from periode;
$$;

-- Signale aux superviseurs/admin les clients dont la fréquence n'est pas respectée
create or replace function public.signaler_non_respect_frequence()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select distinct coalesce(se.superviseur_id, adm.id), 'FREQUENCE_NON_RESPECTEE',
    'Fréquence de visite non respectée',
    format('%s (%s) n''a pas été visité selon la fréquence attendue.', vf.nom, vf.potentiel),
    jsonb_build_object('client_id', vf.client_id, 'vm_id', vf.vm_id)
  from public.v_client_frequence vf
  join public.profiles p on p.id = vf.vm_id
  left join public.superviseur_equipes se on se.equipe_id = p.equipe_id
  left join public.profiles adm on adm.role = 'admin'
  where not vf.frequence_respectee and vf.vm_id is not null;
end;
$$;
