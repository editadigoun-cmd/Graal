-- 021: validation serveur de plausibilité géographique (audit cahier des charges, point 7/10/18)
-- Le serveur ne peut pas "recalculer" un GPS, mais il peut rejeter des coordonnées
-- manifestement impossibles (hors du Bénin, ou (0,0) typique d'un échec de localisation
-- déguisé en succès). Ceci ferme la faille où latitude/longitude n'étaient jamais
-- vérifiées côté serveur avant insertion (seule leur immutabilité après coup l'était).

create or replace function public.coord_plausible(p_lat double precision, p_lon double precision)
returns boolean language sql immutable as $$
  select p_lat is not null and p_lon is not null
    and not (p_lat = 0 and p_lon = 0)
    and p_lat between 5.5 and 13.0
    and p_lon between 0.0 and 4.5;
$$;

create or replace function public.trg_visites_validate()
returns trigger language plpgsql as $$
declare
  cloture record;
  ligne record;
  in_portefeuille boolean;
  expected_date date;
begin
  if new.jour <> public.benin_today() then
    raise exception 'Une visite ne peut être saisie que pour la journée en cours (date serveur)';
  end if;

  if not public.coord_plausible(new.latitude, new.longitude) then
    raise exception 'Coordonnées GPS invalides ou hors zone (Bénin) : latitude % / longitude %', new.latitude, new.longitude;
  end if;

  select * into cloture from public.clotures_journalieres where vm_id = new.vm_id and jour = new.jour;
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

    expected_date := ligne.semaine_debut + public.jour_offset(ligne.jour);
    if expected_date <> new.jour then
      raise exception 'Cette ligne correspond au % : une fiche d''un autre jour ne peut pas être réutilisée', expected_date;
    end if;

    new.statut := 'REALISEE';
  end if;

  return new;
end;
$$;

create or replace function public.cloturer_journee(
  p_photo_path text,
  p_photo_latitude double precision,
  p_photo_longitude double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vm uuid := auth.uid();
  v_jour date := public.benin_today();
  v_manquantes int;
  v_heure_limite time;
  v_en_retard boolean;
begin
  if v_vm is null then
    raise exception 'Non authentifié';
  end if;

  select count(*) into v_manquantes
  from public.programme_lignes pl
  join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
  where ph.vm_id = v_vm
    and ph.statut in ('VALIDE', 'VERROUILLE')
    and ph.semaine_debut + public.jour_offset(pl.jour) = v_jour
    and not exists (select 1 from public.visites v where v.programme_ligne_id = pl.id)
    and not exists (select 1 from public.visite_manquante_motifs m where m.programme_ligne_id = pl.id);

  if v_manquantes > 0 then
    raise exception 'Un motif est requis pour chaque visite programmée non réalisée (% restante(s))', v_manquantes;
  end if;

  if p_photo_path is null then
    raise exception 'La photo de la fiche papier est obligatoire pour clôturer la journée';
  end if;

  if not public.coord_plausible(p_photo_latitude, p_photo_longitude) then
    raise exception 'Coordonnées GPS de la photo invalides ou hors zone (Bénin)';
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

  if not found then
    raise exception 'Clôture déjà finalisée pour cette journée';
  end if;

  return jsonb_build_object('statut', 'CLOTUREE', 'en_retard', v_en_retard, 'heure', now());
end;
$$;

revoke execute on function public.coord_plausible(double precision, double precision) from public;
grant execute on function public.coord_plausible(double precision, double precision) to authenticated;
