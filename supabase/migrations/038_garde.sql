-- 038: système de garde — après la clôture de sa journée (19h), un VM peut visiter des
-- médecins/pharmacies de son portefeuille en heures de garde (hors créneau habituel), puis
-- capture une fiche de fin de garde pour notifier le superviseur. Une session de garde par
-- VM et par jour ; les visites de garde référencent cette session via visites.garde_id.

create type statut_garde as enum ('EN_COURS', 'TERMINEE');

create table public.gardes (
  id uuid primary key default gen_random_uuid(),
  vm_id uuid not null references public.profiles(id) on delete cascade,
  jour date not null,
  statut statut_garde not null default 'EN_COURS',
  demarree_at timestamptz not null default now(),
  terminee_at timestamptz,
  photo_path text,
  photo_latitude double precision,
  photo_longitude double precision,
  created_at timestamptz not null default now(),
  unique (vm_id, jour)
);

alter table public.visites add column if not exists garde_id uuid references public.gardes(id);
create index if not exists visites_garde_idx on public.visites(garde_id);

alter table public.gardes enable row level security;

create policy gardes_select on public.gardes for select to authenticated using (
  vm_id = auth.uid() or public.is_admin() or public.is_vm_in_my_scope(vm_id)
);
create policy gardes_insert on public.gardes for insert to authenticated with check (vm_id = auth.uid());

-- Remplace trg_visites_validate() (021_geoloc_plausibility.sql) pour distinguer les visites
-- de garde : elles ne sont autorisées qu'APRÈS la clôture (inverse des visites normales/hors
-- programme, bloquées après clôture), doivent référencer une session de garde EN_COURS
-- appartenant au VM, et ne portent ni programme_ligne_id ni motif hors programme.
create or replace function public.trg_visites_validate()
returns trigger language plpgsql as $$
declare
  cloture record;
  ligne record;
  garde record;
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

-- Clôture la session de garde du jour et notifie le(s) superviseur(s) de l'équipe du VM
-- (ou les admins à défaut), même convention que signaler_non_respect_frequence().
create or replace function public.terminer_garde(
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
begin
  if v_vm is null then
    raise exception 'Non authentifié';
  end if;

  if p_photo_path is null then
    raise exception 'La photo de fin de garde est obligatoire';
  end if;

  if not public.coord_plausible(p_photo_latitude, p_photo_longitude) then
    raise exception 'Coordonnées GPS de la photo invalides ou hors zone (Bénin)';
  end if;

  update public.gardes
  set statut = 'TERMINEE', terminee_at = now(),
      photo_path = p_photo_path, photo_latitude = p_photo_latitude, photo_longitude = p_photo_longitude
  where vm_id = v_vm and jour = v_jour and statut = 'EN_COURS';

  if not found then
    raise exception 'Aucune garde en cours à clôturer';
  end if;

  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select distinct coalesce(se.superviseur_id, adm.id), 'GARDE_TERMINEE', 'Garde terminée',
    format('%s a terminé sa garde du %s.', coalesce((select full_name from public.profiles where id = v_vm), 'Un VM'), v_jour),
    jsonb_build_object('vm_id', v_vm, 'jour', v_jour)
  from public.profiles p
  left join public.superviseur_equipes se on se.equipe_id = p.equipe_id
  left join public.profiles adm on adm.role = 'admin'
  where p.id = v_vm and (se.superviseur_id is not null or adm.id is not null);

  return jsonb_build_object('statut', 'TERMINEE', 'heure', now());
end;
$$;

revoke execute on function public.terminer_garde(text, double precision, double precision) from public;
grant execute on function public.terminer_garde(text, double precision, double precision) to authenticated;
