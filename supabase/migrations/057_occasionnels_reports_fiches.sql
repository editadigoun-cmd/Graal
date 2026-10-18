-- 057: clients occasionnels, reports de visites et téléchargement anticipé des fiches.
create table if not exists public.visites_reportees (
  id uuid primary key default gen_random_uuid(),
  vm_id uuid not null references public.profiles(id) on delete cascade,
  programme_ligne_id uuid not null unique references public.programme_lignes(id) on delete cascade,
  semaine_debut date not null,
  jour_source date not null,
  jour_report date not null,
  created_at timestamptz not null default now(),
  constraint visites_reportees_meme_semaine check (
    date_trunc('week', jour_source::timestamp)::date = semaine_debut
    and date_trunc('week', jour_report::timestamp)::date = semaine_debut
    and jour_report > jour_source
    and extract(isodow from jour_report) between 1 and 5
  )
);
create index if not exists visites_reportees_vm_jour_idx on public.visites_reportees(vm_id, jour_report);
alter table public.visites_reportees enable row level security;
drop policy if exists visites_reportees_select_own on public.visites_reportees;
create policy visites_reportees_select_own on public.visites_reportees
  for select to authenticated using (vm_id = auth.uid() or public.is_admin() or public.is_superviseur());
grant select on public.visites_reportees to authenticated;

create or replace view public.v_lignes_avec_statut as
select pl.id as programme_ligne_id,
       ph.id as programme_id,
       ph.vm_id,
       ph.semaine_debut,
       pl.jour,
       coalesce(vr.jour_report, ph.semaine_debut + public.jour_offset(pl.jour)) as date_visite,
       pl.client_id,
       c.nom as client_nom,
       c.potentiel,
       c.specialite,
       pl.type_visite,
       ph.statut as programme_statut,
       v.id as visite_id,
       coalesce(v.statut::text, case when mvm.id is not null then 'NON_FAITE'::text else 'EN_ATTENTE'::text end) as statut_reel,
       (vr.id is not null) as reportee,
       vr.jour_report as date_report
from public.programme_lignes pl
join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
join public.clients c on c.id = pl.client_id
left join public.visites v on v.programme_ligne_id = pl.id
left join public.visite_manquante_motifs mvm on mvm.programme_ligne_id = pl.id
left join public.visites_reportees vr on vr.programme_ligne_id = pl.id;

CREATE OR REPLACE FUNCTION public.trg_visites_validate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  cloture record;
  ligne record;
  garde record;
  in_portefeuille boolean;
  expected_date date;
  reported_date date;
  v_week_start date;
  v_week_count int;
  v_day_count int;
begin
  if new.jour <> public.benin_today() then
    raise exception 'Une visite ne peut être saisie que pour la journée en cours (date serveur)';
  end if;

  if not public.coord_plausible(new.latitude, new.longitude) then
    raise exception 'Coordonnées GPS invalides ou hors zone (Bénin) : latitude % / longitude %', new.latitude, new.longitude;
  end if;

  select * into cloture from public.clotures_journalieres where vm_id = new.vm_id and jour = new.jour;

  if new.garde_id is not null then
    if new.hors_programme or new.programme_ligne_id is not null then
      raise exception 'Une visite de garde ne référence ni ligne de programme ni motif hors programme';
    end if;

    select * into garde from public.gardes where id = new.garde_id;
    if garde is null or garde.vm_id <> new.vm_id or garde.jour <> new.jour then
      raise exception 'Session de garde invalide';
    end if;
    if garde.statut <> 'EN_COURS' then
      raise exception 'Cette session de garde est déjà terminée';
    end if;
    if cloture is null or cloture.statut = 'EN_ATTENTE' then
      raise exception 'La garde n''est disponible qu''après la clôture de la journée';
    end if;

    select exists(
      select 1 from public.portefeuille where client_id = new.client_id and vm_id = new.vm_id
    ) into in_portefeuille;
    if not in_portefeuille then
      raise exception 'Ce client ne fait pas partie du portefeuille de ce VM';
    end if;

    new.statut := 'REALISEE';
    return new;
  end if;

  if cloture is not null and cloture.statut <> 'EN_ATTENTE' then
    raise exception 'La journée du % est déjà clôturée : aucune nouvelle saisie possible', new.jour;
  end if;

  select exists(
    select 1 from public.portefeuille where client_id = new.client_id and vm_id = new.vm_id
  ) into in_portefeuille;
  if not in_portefeuille then
    raise exception 'Ce client ne fait pas partie du portefeuille de ce VM';
  end if;

  if new.hors_programme then
    if new.programme_ligne_id is not null then
      raise exception 'Une visite "hors programme" ne référence aucune ligne du programme';
    end if;
    -- Quotas des clients occasionnels non programmés : 2 par jour, 7 par semaine.
    select count(*) into v_day_count from public.visites
      where vm_id = new.vm_id and jour = new.jour and hors_programme and garde_id is null;
    if v_day_count >= 2 then
      raise exception 'Quota de clients occasionnels atteint : maximum 2 par jour';
    end if;
    v_week_start := date_trunc('week', new.jour::timestamp)::date;
    select count(*) into v_week_count from public.visites
      where vm_id = new.vm_id and jour between v_week_start and v_week_start + 4
        and hors_programme and garde_id is null;
    if v_week_count >= 7 then
      raise exception 'Quota hebdomadaire de clients occasionnels atteint : maximum 7 par semaine';
    end if;
    new.statut := 'HORS_PROGRAMME';
  else
    if new.programme_ligne_id is null then
      raise exception 'Toute visite doit référencer une ligne du programme du jour, sauf statut "Hors programme"';
    end if;

    select pl.client_id, pl.type_visite, pl.jour, ph.vm_id as prog_vm_id, ph.statut as prog_statut, ph.semaine_debut
      into ligne
      from public.programme_lignes pl
      join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
      where pl.id = new.programme_ligne_id;

    if ligne is null then
      raise exception 'Ligne de programme introuvable';
    end if;
    if ligne.prog_vm_id <> new.vm_id then
      raise exception 'Cette ligne de programme n''appartient pas à ce VM';
    end if;
    if ligne.prog_statut not in ('VALIDE', 'VERROUILLE') then
      raise exception 'Le programme de la semaine n''est pas encore validé';
    end if;
    if ligne.client_id <> new.client_id then
      raise exception 'Le client saisi ne correspond pas à la ligne programmée';
    end if;
    if ligne.type_visite <> new.type_visite then
      raise exception 'Le type de visite ne correspond pas à la ligne programmée';
    end if;

    select vr.jour_report into reported_date
      from public.visites_reportees vr
      where vr.programme_ligne_id = new.programme_ligne_id and vr.vm_id = new.vm_id;
    expected_date := coalesce(reported_date, ligne.semaine_debut + public.jour_offset(ligne.jour));
    if expected_date <> new.jour then
      raise exception 'Cette ligne correspond au % : une fiche d''un autre jour ne peut pas être réutilisée', expected_date;
    end if;

    new.statut := 'REALISEE';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cloturer_journee(p_photo_path text, p_photo_latitude double precision, p_photo_longitude double precision, p_reports jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vm uuid := auth.uid();
  v_jour date := public.benin_today();
  v_manquantes int;
  v_heure_limite time;
  v_en_retard boolean;
  v_report record;
  v_source record;
  v_date_cible date;
  v_semaine date;
  v_compte_semaine int;
  v_compte_jour int;
begin
  if v_vm is null then
    raise exception 'Non authentifié';
  end if;

  -- Enregistrer les reports choisis à la clôture, avec quotas de 2 par jour et 5 par semaine.
  for v_report in
    select * from jsonb_to_recordset(coalesce(p_reports, '[]'::jsonb))
      as x(programme_ligne_id uuid, jour_report date)
  loop
    select pl.id, pl.jour, ph.semaine_debut, ph.statut, ph.vm_id,
           ph.semaine_debut + public.jour_offset(pl.jour) as date_source
      into v_source
      from public.programme_lignes pl
      join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
      where pl.id = v_report.programme_ligne_id and ph.vm_id = v_vm;
    if v_source.id is null or v_source.statut not in ('VALIDE', 'VERROUILLE') then
      raise exception 'Client à reporter introuvable ou programme non validé';
    end if;
    if v_source.date_source <> v_jour then
      raise exception 'Seules les visites manquées de la journée en cours peuvent être reportées';
    end if;
    v_semaine := v_source.semaine_debut;
    v_date_cible := v_report.jour_report;
    if v_date_cible <= v_jour or v_date_cible > v_semaine + 4
       or date_trunc('week', v_date_cible::timestamp)::date <> v_semaine then
      raise exception 'Le report doit viser un autre jour ouvrable de la même semaine';
    end if;
    if extract(isodow from v_date_cible) not between 1 and 5 then
      raise exception 'Le report doit viser du lundi au vendredi';
    end if;
    if exists(select 1 from public.visites where programme_ligne_id = v_source.id) then
      raise exception 'Une visite déjà réalisée ne peut pas être reportée';
    end if;
    if exists(select 1 from public.visites_reportees where programme_ligne_id = v_source.id) then
      raise exception 'Cette visite a déjà été reportée';
    end if;
    select count(*) into v_compte_semaine from public.visites_reportees
      where vm_id = v_vm and semaine_debut = v_semaine;
    if v_compte_semaine >= 5 then
      raise exception 'Maximum 5 visites reportées par semaine';
    end if;
    select count(*) into v_compte_jour from public.visites_reportees
      where vm_id = v_vm and jour_report = v_date_cible;
    if v_compte_jour >= 2 then
      raise exception 'Maximum 2 visites reportées pour ce jour';
    end if;
    insert into public.visites_reportees(vm_id, programme_ligne_id, semaine_debut, jour_source, jour_report)
      values(v_vm, v_source.id, v_semaine, v_jour, v_date_cible);
  end loop;

  select count(*) into v_manquantes
  from public.programme_lignes pl
  join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
  where ph.vm_id = v_vm
    and ph.statut in ('VALIDE', 'VERROUILLE')
    and ph.semaine_debut + public.jour_offset(pl.jour) = v_jour
    and not exists (select 1 from public.visites v where v.programme_ligne_id = pl.id)
    and not exists (select 1 from public.visite_manquante_motifs m where m.programme_ligne_id = pl.id)
    and not exists (select 1 from public.visites_reportees vr where vr.programme_ligne_id = pl.id);

  if v_manquantes > 0 then
    raise exception 'Un motif est requis pour chaque visite programmée non réalisée (% restante(s))', v_manquantes;
  end if;

  if p_photo_path is null then
    raise exception 'La photo de la fiche papier est obligatoire pour clôturer la journée';
  end if;

  v_heure_limite := public.parametre_text('heure_cloture_journee', '19:00')::time;
  v_en_retard := public.benin_now()::time > v_heure_limite;

  perform set_config('graal.internal_rpc', 'on', true);
  insert into public.clotures_journalieres
    (vm_id, jour, statut, heure_cloture, photo_path, photo_horodatage, photo_latitude, photo_longitude, en_retard)
  values
    (v_vm, v_jour, 'CLOTUREE', now(), p_photo_path, now(), p_photo_latitude, p_photo_longitude, v_en_retard)
  on conflict (vm_id, jour) do update set
    statut = 'CLOTUREE', heure_cloture = now(), photo_path = excluded.photo_path,
    photo_horodatage = now(), photo_latitude = excluded.photo_latitude,
    photo_longitude = excluded.photo_longitude, en_retard = excluded.en_retard
  where public.clotures_journalieres.statut = 'EN_ATTENTE';

  return jsonb_build_object(
    'statut', 'CLOTUREE',
    'en_retard', v_en_retard,
    'heure', now(),
    'heure_limite', v_heure_limite
  );
end;
$function$

