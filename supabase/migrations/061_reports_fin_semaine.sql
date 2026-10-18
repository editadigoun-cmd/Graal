-- 061: le vendredi, une visite déjà reportée peut être clôturée avec son motif existant
-- puisqu'aucun autre jour de la même semaine n'est disponible.
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
  v_report_existant record;
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
    select * into v_report_existant from public.visites_reportees
      where programme_ligne_id = v_source.id and vm_id = v_vm;
    if v_source.date_source <> v_jour
       and (v_report_existant.id is null or v_report_existant.jour_report <> v_jour) then
      raise exception 'Seules les visites manquées du jour ou les visites déjà reportées pour aujourd''hui peuvent être déplacées';
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
    if v_report_existant.id is not null and v_report_existant.jour_report <> v_jour then
      raise exception 'Cette visite est déjà reportée vers un autre jour';
    end if;
    if v_report_existant.id is null then
      select count(*) into v_compte_semaine from public.visites_reportees
        where vm_id = v_vm and semaine_debut = v_semaine;
      if v_compte_semaine >= 5 then
        raise exception 'Maximum 5 visites reportées par semaine';
      end if;
    end if;
    select count(*) into v_compte_jour from public.visites_reportees
      where vm_id = v_vm and jour_report = v_date_cible
        and id is distinct from v_report_existant.id;
    if v_compte_jour >= 2 then
      raise exception 'Maximum 2 visites reportées pour ce jour';
    end if;
    if v_report_existant.id is not null then
      update public.visites_reportees set jour_report = v_date_cible where id = v_report_existant.id;
    else
      insert into public.visites_reportees(vm_id, programme_ligne_id, semaine_debut, jour_source, jour_report)
        values(v_vm, v_source.id, v_semaine, v_jour, v_date_cible);
    end if;
  end loop;

  select count(*) into v_manquantes
  from public.programme_lignes pl
  join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
  where ph.vm_id = v_vm
    and ph.statut in ('VALIDE', 'VERROUILLE')
    and (
      ph.semaine_debut + public.jour_offset(pl.jour) = v_jour
      or exists (select 1 from public.visites_reportees vr where vr.programme_ligne_id = pl.id and vr.jour_report = v_jour)
    )
    and not exists (select 1 from public.visites v where v.programme_ligne_id = pl.id)
    and (
      (not exists (select 1 from public.visite_manquante_motifs m where m.programme_ligne_id = pl.id)
       and (
         not exists (select 1 from public.visites_reportees vr where vr.programme_ligne_id = pl.id)
         or exists (select 1 from public.visites_reportees vr where vr.programme_ligne_id = pl.id
                    and vr.jour_report = v_jour and v_jour >= ph.semaine_debut + 4)
       ))
      or exists (select 1 from public.visites_reportees vr where vr.programme_ligne_id = pl.id
                 and vr.jour_report = v_jour and v_jour < ph.semaine_debut + 4)
    );

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
;
