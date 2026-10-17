-- 054: allow VMs to programme their portfolio across all sectors and move deadline to Saturday 14:00.
-- Business controls (portfolio ownership, medical/pharmacy type, potential hierarchy,
-- weekday quotas, duplicate prevention, and weekly submission validation) remain enforced.

drop trigger if exists programmes_secteur_alternance on public.programmes_hebdomadaires;
drop trigger if exists programme_lignes_same_sector on public.programme_lignes;

create or replace function public.trg_programme_lignes_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prog record;
  cl record;
  is_fusion boolean;
  in_portefeuille boolean;
  nb_moyen_deroge int;
  max_moyen_deroge int;
begin
  select * into prog
  from public.programmes_hebdomadaires
  where id = new.programme_id;

  if prog is null then
    raise exception 'Programme hebdomadaire introuvable';
  end if;

  if prog.statut <> 'BROUILLON' then
    raise exception 'Le programme est au statut % : ses lignes ne peuvent plus être modifiées', prog.statut;
  end if;

  select * into cl from public.clients where id = new.client_id;
  if cl is null then
    raise exception 'Client introuvable';
  end if;
  if not cl.actif then
    raise exception 'Client % désactivé, non programmable', cl.nom;
  end if;

  is_fusion := public.fusion_active(prog.semaine_debut, cl.potentiel);

  -- Les secteurs/zones ne limitent plus la programmation. Le client doit toutefois
  -- appartenir au portefeuille du VM, sauf dérogation de fusion explicitement active.
  select exists (
    select 1
    from public.portefeuille
    where client_id = new.client_id and vm_id = prog.vm_id
  ) into in_portefeuille;

  if not in_portefeuille and not is_fusion then
    raise exception 'Le client "%" ne fait pas partie du portefeuille de ce VM', cl.nom;
  end if;

  if prog.mode_pharmacie_uniquement and new.type_visite <> 'PHARMACIE' then
    raise exception 'Semaine en mode "pharmacie uniquement" : seules les pharmacies sont programmables';
  end if;

  if new.type_visite = 'MEDICAL' and cl.specialite = 'PHARMACIE' then
    raise exception 'Type de visite incorrect : une pharmacie doit être ajoutée comme visite PHARMACIE';
  end if;
  if new.type_visite = 'PHARMACIE' and cl.specialite <> 'PHARMACIE' then
    raise exception 'Type de visite incorrect : seuls les clients pharmacie peuvent être ajoutés comme visite PHARMACIE';
  end if;

  if new.type_visite = 'MEDICAL' and cl.potentiel = 'MOYEN' and new.jour in ('LUNDI', 'MARDI', 'MERCREDI') then
    max_moyen_deroge := public.parametre_numeric('nb_max_moyen_lun_mar_mer_jour', 3)::int;
    select count(*) into nb_moyen_deroge
    from public.programme_lignes pl
    join public.clients c2 on c2.id = pl.client_id
    where pl.programme_id = new.programme_id
      and pl.jour = new.jour
      and pl.type_visite = 'MEDICAL'
      and c2.potentiel = 'MOYEN'
      and pl.id is distinct from new.id;

    if nb_moyen_deroge >= max_moyen_deroge then
      raise exception 'Dérogation "médecins moyens" épuisée le % : maximum % par jour',
        new.jour, max_moyen_deroge;
    end if;
  elsif not public.potentiel_autorise(new.jour, cl.potentiel) then
    raise exception 'Hiérarchisation non respectée : "%" (potentiel %) n''est pas autorisé le %',
      cl.nom, cl.potentiel, new.jour;
  end if;

  if exists (
    select 1 from public.programme_lignes
    where programme_id = new.programme_id
      and client_id = new.client_id
      and id is distinct from new.id
  ) and not exists (
    select 1 from public.derogations_doublon_client
    where programme_id = new.programme_id and client_id = new.client_id
  ) then
    raise exception 'Le client "%" est déjà programmé cette semaine (dérogation administrateur requise pour un doublon)', cl.nom;
  end if;

  return new;
end;
$$;

-- La deadline est pilotée par ce paramètre par la RPC et le rappel e-mail/in-app.
update public.parametres
set value = '"14:00"'::jsonb
where key = 'heure_limite_soumission_programme';

-- Score de ponctualité : utiliser la même échéance (samedi 14h, heure du Bénin).
create or replace function public.score_mensuel_vm(p_vm_id uuid, p_mois date)
returns table (
  vm_id uuid,
  mois date,
  taux_couverture numeric,
  ponctualite numeric,
  execution_planning numeric,
  discipline_clotures numeric,
  score_global numeric
)
language sql
stable
as $$
  with periode as (
    select date_trunc('month', p_mois)::date as debut,
           (date_trunc('month', p_mois) + interval '1 month')::date as fin
  ),
  couverture as (
    select avg(case when frequence_respectee then 1 else 0 end) as taux
    from public.v_client_frequence where vm_id = p_vm_id
  ),
  ponctu as (
    select avg(case
      when soumis_at is not null
       and soumis_at <= (((semaine_debut - 2) + public.parametre_text('heure_limite_soumission_programme', '14:00')::time) at time zone 'Africa/Porto-Novo')
      then 1 else 0 end) as taux
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

create or replace function public.rappel_soumission_programme()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semaine date := public.benin_today() + (8 - extract(isodow from public.benin_today()))::int;
  v_heure text := coalesce(public.parametre_text('heure_limite_soumission_programme', '14:00'), '14:00');
begin
  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select p.id, 'RAPPEL_SOUMISSION', 'Programme hebdomadaire à soumettre',
    format('Pensez à soumettre votre programme de la semaine du %s avant samedi %s (heure du Bénin).',
      to_char(v_semaine, 'DD/MM/YYYY'), v_heure),
    jsonb_build_object('semaine_debut', v_semaine, 'deadline', 'samedi ' || v_heure)
  from public.profiles p
  where p.role = 'vm' and p.actif
    and not exists (
      select 1 from public.programmes_hebdomadaires ph
      where ph.vm_id = p.id and ph.semaine_debut = v_semaine and ph.statut <> 'BROUILLON'
    );
end;
$$;
