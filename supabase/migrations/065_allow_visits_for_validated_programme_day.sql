-- Permit visit submission when the specific programme day has been validated,
-- even if the whole weekly programme has not yet reached VALIDE/VERROUILLE.
-- All other visit guards (date, GPS, portfolio, quotas, ownership, visit type,
-- reported-date handling, and day closure) remain enforced.
create or replace function public.trg_visites_validate()
returns trigger language plpgsql as $$
declare
  cloture record; ligne record; garde record; in_portefeuille boolean;
  expected_date date; reported_date date; v_week_start date; v_week_count int; v_day_count int;
begin
  if new.jour <> public.benin_today() then
    raise exception 'Une visite ne peut être saisie que pour la journée en cours (date serveur)';
  end if;
  if not public.coord_plausible(new.latitude, new.longitude) then
    raise exception 'Coordonnées GPS invalides ou hors zone (Bénin) : latitude % / longitude %', new.latitude, new.longitude;
  end if;
  select * into cloture from public.clotures_journalieres where vm_id = new.vm_id and jour = new.jour;
  if new.garde_id is not null then
    if new.hors_programme or new.programme_ligne_id is not null then raise exception 'Une visite de garde ne référence ni ligne de programme ni motif hors programme'; end if;
    select * into garde from public.gardes where id = new.garde_id;
    if garde is null or garde.vm_id <> new.vm_id or garde.jour <> new.jour then raise exception 'Session de garde invalide'; end if;
    if garde.statut <> 'EN_COURS' then raise exception 'Cette session de garde est déjà terminée'; end if;
    if cloture is null or cloture.statut = 'EN_ATTENTE' then raise exception 'La garde n''est disponible qu''après la clôture de la journée'; end if;
    select exists(select 1 from public.portefeuille where client_id = new.client_id and vm_id = new.vm_id) into in_portefeuille;
    if not in_portefeuille then raise exception 'Ce client ne fait pas partie du portefeuille de ce VM'; end if;
    new.statut := 'REALISEE'; return new;
  end if;
  if cloture is not null and cloture.statut <> 'EN_ATTENTE' then raise exception 'La journée du % est déjà clôturée : aucune nouvelle saisie possible', new.jour; end if;
  select exists(select 1 from public.portefeuille where client_id = new.client_id and vm_id = new.vm_id) into in_portefeuille;
  if not in_portefeuille then raise exception 'Ce client ne fait pas partie du portefeuille de ce VM'; end if;
  if new.hors_programme then
    if new.programme_ligne_id is not null then raise exception 'Une visite "hors programme" ne référence aucune ligne du programme'; end if;
    select count(*) into v_day_count from public.visites where vm_id = new.vm_id and jour = new.jour and hors_programme and garde_id is null;
    if v_day_count >= 2 then raise exception 'Quota de clients occasionnels atteint : maximum 2 par jour'; end if;
    v_week_start := date_trunc('week', new.jour::timestamp)::date;
    select count(*) into v_week_count from public.visites where vm_id = new.vm_id and jour between v_week_start and v_week_start + 4 and hors_programme and garde_id is null;
    if v_week_count >= 7 then raise exception 'Quota hebdomadaire de clients occasionnels atteint : maximum 7 par semaine'; end if;
    new.statut := 'HORS_PROGRAMME';
  else
    if new.programme_ligne_id is null then raise exception 'Toute visite doit référencer une ligne du programme du jour, sauf statut "Hors programme"'; end if;
    select pl.programme_id as prog_id, pl.client_id, pl.type_visite, pl.jour, ph.vm_id as prog_vm_id, ph.statut as prog_statut, ph.semaine_debut
      into ligne from public.programme_lignes pl join public.programmes_hebdomadaires ph on ph.id = pl.programme_id where pl.id = new.programme_ligne_id;
    if ligne is null then raise exception 'Ligne de programme introuvable'; end if;
    if ligne.prog_vm_id <> new.vm_id then raise exception 'Cette ligne de programme n''appartient pas à ce VM'; end if;
    if ligne.prog_statut not in ('VALIDE', 'VERROUILLE')
       and not exists (select 1 from public.programme_jours_validation pjv where pjv.programme_id = ligne.prog_id and pjv.jour = ligne.jour and pjv.statut = 'VALIDE') then
      raise exception 'Le programme de ce jour n''est pas encore validé';
    end if;
    if ligne.client_id <> new.client_id then raise exception 'Le client saisi ne correspond pas à la ligne programmée'; end if;
    if ligne.type_visite <> new.type_visite then raise exception 'Le type de visite ne correspond pas à la ligne programmée'; end if;
    select vr.jour_report into reported_date from public.visites_reportees vr where vr.programme_ligne_id = new.programme_ligne_id and vr.vm_id = new.vm_id;
    expected_date := coalesce(reported_date, ligne.semaine_debut + public.jour_offset(ligne.jour));
    if expected_date <> new.jour then raise exception 'Cette ligne correspond au % : une fiche d''un autre jour ne peut pas être réutilisée', expected_date; end if;
    new.statut := 'REALISEE';
  end if;
  return new;
end;
$$;
