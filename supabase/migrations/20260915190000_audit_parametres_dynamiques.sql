-- Audit/correction des paramètres administrables : aucun délai métier important ne doit rester codé en dur.

create or replace function public.trg_plan_activites_validate()
returns trigger language plpgsql set search_path = public as $$
declare
  limite date;
  jour_limite int;
begin
  jour_limite := greatest(1, least(31, public.parametre_numeric('jour_limite_plan_activites', 25)::int));
  limite := (date_trunc('month', new.mois) - interval '1 month')::date + (jour_limite - 1);
  if public.benin_today() > limite and not public.is_admin() then
    raise exception 'Délai dépassé : le plan d''activités doit être soumis au plus tard le % du mois précédent (limite : %)', jour_limite, limite;
  end if;
  return new;
end;
$$;

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
    select avg(case when soumis_at is not null and soumis_at <= (((semaine_debut - 4) + public.parametre_text('heure_limite_soumission_programme', '21:00')::time) at time zone 'Africa/Porto-Novo') then 1 else 0 end) as taux
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

create or replace function public.score_mensuel_vm_conforme(p_vm_id uuid, p_mois date)
returns boolean language sql stable as $$
  select coalesce((select score_global from public.score_mensuel_vm(p_vm_id, p_mois)), 0)
    >= public.parametre_numeric('score_mensuel_minimal', 90);
$$;

create or replace function public.forcer_clotures_du_jour()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_jour date := public.benin_today();
  v_heure_forcee time := public.parametre_text('heure_cloture_forcee', '20:00')::time;
  r record;
  motif_force uuid;
begin
  if public.benin_now()::time < v_heure_forcee then
    return;
  end if;

  select id into motif_force from public.motifs_non_visite
    where libelle = 'Non faite / non justifiée (clôture forcée)';

  for r in
    select distinct ph.vm_id
    from public.programmes_hebdomadaires ph
    join public.programme_lignes pl on pl.programme_id = ph.id
    where ph.statut in ('VALIDE', 'VERROUILLE')
      and ph.semaine_debut + public.jour_offset(pl.jour) = v_jour
  loop
    if not exists (
      select 1 from public.clotures_journalieres
      where vm_id = r.vm_id and jour = v_jour and statut <> 'EN_ATTENTE'
    ) then
      perform set_config('graal.internal_rpc', 'on', true);

      insert into public.visite_manquante_motifs (programme_ligne_id, motif_id, commentaire, cree_par)
      select pl.id, motif_force, 'Clôture automatique forcée (heure limite dépassée)', r.vm_id
      from public.programme_lignes pl
      join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
      where ph.vm_id = r.vm_id
        and ph.statut in ('VALIDE', 'VERROUILLE')
        and ph.semaine_debut + public.jour_offset(pl.jour) = v_jour
        and not exists (select 1 from public.visites v where v.programme_ligne_id = pl.id)
        and not exists (select 1 from public.visite_manquante_motifs m where m.programme_ligne_id = pl.id);

      insert into public.clotures_journalieres (vm_id, jour, statut, heure_cloture, en_retard)
      values (r.vm_id, v_jour, 'CLOTUREE_FORCEE', now(), true)
      on conflict (vm_id, jour) do update set
        statut = 'CLOTUREE_FORCEE', heure_cloture = now(), en_retard = true
      where public.clotures_journalieres.statut = 'EN_ATTENTE';

      insert into public.notifications (profile_id, type, titre, corps, metadata)
      select id, 'CLOTURE_FORCEE', 'Clôture forcée',
        format('%s n''a pas clôturé sa journée à temps (%s).',
          coalesce((select full_name from public.profiles where id = r.vm_id), 'Un VM'), v_jour),
        jsonb_build_object('vm_id', r.vm_id, 'jour', v_jour, 'heure_limite', v_heure_forcee)
      from public.profiles where role = 'admin';
    end if;
  end loop;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname in ('graal-cloture-forcee','graal-rappel-cloture-1730h','graal-rappel-cloture-1755h');
select cron.schedule('graal-cloture-forcee', '* * * * 1-5', $$select public.forcer_clotures_du_jour();$$);

create or replace function public.rappel_cloture_journee_parametre()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_heure time := public.parametre_text('heure_cloture_journee', '19:00')::time;
  v_now time := date_trunc('minute', public.benin_now())::time;
begin
  if v_now = v_heure - interval '30 minutes' or v_now = v_heure - interval '5 minutes' then
    perform public.rappel_cloture_journee();
  end if;
end;
$$;

select cron.schedule('graal-rappel-cloture-parametre', '* * * * 1-5', $$select public.rappel_cloture_journee_parametre();$$);
