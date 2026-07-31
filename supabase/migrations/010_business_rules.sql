-- 010: MOTEUR DE RÈGLES MÉTIER — appliqué côté base de données.
-- Ces contrôles s'exécutent quel que soit le point d'entrée (UI, API directe, script) :
-- l'interface n'est qu'une couche de confort, jamais la seule barrière.

create or replace function public.jour_offset(j jour_semaine)
returns int language sql immutable as $$
  select case j
    when 'LUNDI' then 0 when 'MARDI' then 1 when 'MERCREDI' then 2
    when 'JEUDI' then 3 when 'VENDREDI' then 4
  end;
$$;

create or replace function public.potentiel_autorise(p_jour jour_semaine, p_potentiel potentiel_client)
returns boolean language sql immutable as $$
  select case p_jour
    when 'LUNDI' then p_potentiel = 'GROS'
    when 'MARDI' then p_potentiel = 'GROS'
    when 'MERCREDI' then p_potentiel in ('GROS', 'MOYEN')
    when 'JEUDI' then p_potentiel in ('MOYEN', 'FAIBLE')
    when 'VENDREDI' then p_potentiel = 'FAIBLE'
  end;
$$;

create or replace function public.parametre_text(p_key text, p_default text)
returns text language sql stable as $$
  select coalesce(public.get_parametre(p_key) #>> '{}', p_default);
$$;

create or replace function public.parametre_numeric(p_key text, p_default numeric)
returns numeric language sql stable as $$
  select coalesce((public.get_parametre(p_key) #>> '{}')::numeric, p_default);
$$;

-- ============================================================
-- 1. GARDES DE STATUT — empêchent toute transition de statut hors des
--    fonctions dédiées (protection même en cas de policy RLS trop permissive)
-- ============================================================

create or replace function public.trg_programmes_guard_statut()
returns trigger language plpgsql as $$
begin
  if new.statut is distinct from old.statut
     and coalesce(current_setting('graal.internal_rpc', true), 'off') <> 'on' then
    raise exception 'Le statut du programme ne peut être modifié que via soumettre_programme_hebdomadaire()/valider_programme_hebdomadaire()';
  end if;
  return new;
end;
$$;

create trigger programmes_guard_statut
  before update on public.programmes_hebdomadaires
  for each row execute function public.trg_programmes_guard_statut();

create or replace function public.trg_clotures_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.statut is distinct from old.statut
     and coalesce(current_setting('graal.internal_rpc', true), 'off') <> 'on' then
    raise exception 'Le statut de clôture ne peut être modifié que via cloturer_journee()';
  end if;
  return new;
end;
$$;

create trigger clotures_guard
  before update on public.clotures_journalieres
  for each row execute function public.trg_clotures_guard();

create or replace function public.trg_profiles_guard_role()
returns trigger language plpgsql as $$
begin
  if (new.role, new.secteur, new.equipe_id) is distinct from (old.role, old.secteur, old.equipe_id)
     and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le rôle, le secteur ou l''équipe d''un utilisateur';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.trg_profiles_guard_role();

-- ============================================================
-- 2. PROGRAMME HEBDOMADAIRE — verrouillage sectoriel + hiérarchisation
--    + anti-doublon, vérifiés ligne par ligne avant toute soumission
-- ============================================================

create or replace function public.trg_programmes_check_plan()
returns trigger language plpgsql as $$
declare
  v_equipe uuid;
  v_mois date;
begin
  select equipe_id into v_equipe from public.profiles where id = new.vm_id;
  v_mois := date_trunc('month', new.semaine_debut)::date;
  if v_equipe is not null and not public.plan_active_equipe_mois(v_equipe, v_mois) then
    raise exception 'Aucun plan d''activités mensuel soumis pour cette équipe (mois de %) : programmation bloquée jusqu''à soumission par le superviseur',
      to_char(v_mois, 'TMMonth YYYY');
  end if;
  return new;
end;
$$;

create trigger programmes_check_plan
  before insert on public.programmes_hebdomadaires
  for each row execute function public.trg_programmes_check_plan();

create or replace function public.trg_programme_lignes_validate()
returns trigger language plpgsql as $$
declare
  prog record;
  cl record;
  vm record;
  in_portefeuille boolean;
  is_fusion boolean;
begin
  select * into prog from public.programmes_hebdomadaires where id = new.programme_id;
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

  select * into vm from public.profiles where id = prog.vm_id;

  is_fusion := public.fusion_active(prog.semaine_debut, cl.potentiel);

  -- Verrouillage sectoriel : filtrage structurel, non contournable
  if not is_fusion and cl.secteur is distinct from vm.secteur then
    raise exception 'Verrouillage sectoriel : le client "%" appartient au secteur %, ce VM est affecté au secteur %',
      cl.nom, cl.secteur, vm.secteur;
  end if;

  select exists(
    select 1 from public.portefeuille where client_id = new.client_id and vm_id = prog.vm_id
  ) into in_portefeuille;

  if not in_portefeuille and not is_fusion then
    raise exception 'Le client "%" ne fait pas partie du portefeuille de ce VM', cl.nom;
  end if;

  -- Mode "semaine dédiée pharmacie"
  if prog.mode_pharmacie_uniquement and new.type_visite <> 'PHARMACIE' then
    raise exception 'Semaine en mode "pharmacie uniquement" : seules les pharmacies sont programmables';
  end if;

  -- Hiérarchisation stricte par potentiel / jour (médical et pharmacie identiques)
  if not public.potentiel_autorise(new.jour, cl.potentiel) then
    raise exception 'Hiérarchisation non respectée : "%" (potentiel %) n''est pas autorisé le %',
      cl.nom, cl.potentiel, new.jour;
  end if;

  -- Un client ne peut être programmé qu'une fois par semaine, sauf dérogation admin explicite
  if exists (
    select 1 from public.programme_lignes
    where programme_id = new.programme_id and client_id = new.client_id
      and id is distinct from new.id
  ) then
    if not exists (
      select 1 from public.derogations_doublon_client
      where programme_id = new.programme_id and client_id = new.client_id
    ) then
      raise exception 'Le client "%" est déjà programmé cette semaine (dérogation administrateur requise pour un doublon)', cl.nom;
    end if;
  end if;

  return new;
end;
$$;

create trigger programme_lignes_validate
  before insert or update on public.programme_lignes
  for each row execute function public.trg_programme_lignes_validate();

-- Suivi de conformité aux quotas cibles (informatif, ne bloque pas la soumission)
create table public.programme_conformite (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes_hebdomadaires(id) on delete cascade,
  cible text not null,
  quota_attendu int not null,
  quantite_programmee int not null,
  statut text not null,
  created_at timestamptz not null default now(),
  unique (programme_id, cible)
);

-- Soumission du programme — porte d'entrée UNIQUE vers le statut SOUMIS.
-- Verrou non contournable : jeudi 21h00 heure du Bénin (heure serveur, jamais l'heure de l'appareil).
create or replace function public.soumettre_programme_hebdomadaire(p_programme_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prog record;
  deadline timestamp;
  min_medical_jour int;
  min_pharmacie_jour int;
  nb_jeudi_total int;
  nb_jeudi_faible int;
  seuil_faible numeric;
  ratio_faible numeric;
  r record;
  rapport jsonb;
begin
  select * into prog from public.programmes_hebdomadaires where id = p_programme_id;
  if prog is null then
    raise exception 'Programme introuvable';
  end if;
  if prog.vm_id <> auth.uid() and not public.is_admin() then
    raise exception 'Action non autorisée';
  end if;
  if prog.statut <> 'BROUILLON' then
    raise exception 'Programme déjà soumis (statut %)', prog.statut;
  end if;

  deadline := (prog.semaine_debut - 4) + time '21:00';

  if public.benin_now() > deadline and not public.is_admin() then
    -- Pas de RAISE ici : une exception annulerait la transaction et donc la notification
    -- ci-dessous. On retourne plutôt un statut d'échec explicite que le client doit vérifier ;
    -- le programme reste en BROUILLON dans tous les cas (aucune mise à jour de statut n'a lieu).
    insert into public.notifications (profile_id, type, titre, corps, metadata)
    select id, 'SOUMISSION_HORS_DELAI', 'Tentative de soumission hors délai',
      format('%s a tenté de soumettre son programme de la semaine du %s après le délai (jeudi 21h, heure du Bénin).',
        coalesce((select full_name from public.profiles where id = prog.vm_id), 'Un VM'), prog.semaine_debut),
      jsonb_build_object('programme_id', prog.id, 'vm_id', prog.vm_id, 'tentative_a', public.benin_now())
    from public.profiles where role = 'admin';

    return jsonb_build_object(
      'statut', 'REJETE_HORS_DELAI',
      'message', 'Délai de soumission dépassé : le programme devait être soumis avant jeudi 21h00 (heure du Bénin)'
    );
  end if;

  if not exists (select 1 from public.programme_lignes where programme_id = p_programme_id) then
    raise exception 'Le programme est vide';
  end if;

  if not prog.mode_pharmacie_uniquement then
    min_medical_jour := public.parametre_numeric('visites_minimum_medical_jour', 15);
    min_pharmacie_jour := public.parametre_numeric('visites_minimum_pharmacie_jour', 3);

    if (select count(distinct jour) from public.programme_lignes where programme_id = p_programme_id) < 5 then
      raise exception 'Le programme doit couvrir les 5 jours de la semaine (Lundi à Vendredi)';
    end if;

    for r in
      select jour,
             count(*) filter (where type_visite = 'MEDICAL') as nb_medical,
             count(*) filter (where type_visite = 'PHARMACIE') as nb_pharmacie
      from public.programme_lignes
      where programme_id = p_programme_id
      group by jour
    loop
      if r.nb_medical < min_medical_jour or r.nb_pharmacie < min_pharmacie_jour then
        raise exception 'Minimum non atteint le % : % visites médicales (minimum %), % pharmacies (minimum %)',
          r.jour, r.nb_medical, min_medical_jour, r.nb_pharmacie, min_pharmacie_jour;
      end if;
    end loop;
  end if;

  -- Part limitée de clients FAIBLE le jeudi (seuil paramétrable par l'administrateur)
  select count(*) filter (where cl.potentiel = 'FAIBLE'), count(*)
    into nb_jeudi_faible, nb_jeudi_total
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
    where pl.programme_id = p_programme_id and pl.jour = 'JEUDI';

  seuil_faible := public.parametre_numeric('seuil_faible_jeudi_pourcentage_max', 50) / 100.0;

  if nb_jeudi_total > 0 then
    ratio_faible := nb_jeudi_faible::numeric / nb_jeudi_total;
    if ratio_faible > seuil_faible then
      raise exception 'Part de clients FAIBLE le jeudi trop élevée : %s%% programmés (maximum autorisé %s%%)',
        round(ratio_faible * 100), round(seuil_faible * 100);
    end if;
  end if;

  -- Contrôle de conformité aux quotas cibles — informatif (code couleur), ne bloque pas
  delete from public.programme_conformite where programme_id = p_programme_id;
  insert into public.programme_conformite (programme_id, cible, quota_attendu, quantite_programmee, statut)
  select p_programme_id, qc.cible, qc.quota_hebdomadaire, coalesce(cnt.n, 0),
    case
      when coalesce(cnt.n, 0) = qc.quota_hebdomadaire then 'CONFORME'
      when coalesce(cnt.n, 0) < qc.quota_hebdomadaire then 'SOUS_COUVERT'
      else 'SUR_COUVERT'
    end
  from public.quotas_cibles qc
  left join (
    select public.cible_pour_specialite(cl.specialite) as cible, count(*) as n
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
    where pl.programme_id = p_programme_id
    group by 1
  ) cnt on cnt.cible = qc.cible;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
    set statut = 'SOUMIS', soumis_at = now()
    where id = p_programme_id;

  select jsonb_agg(to_jsonb(pc) - 'id' - 'programme_id') into rapport
    from public.programme_conformite pc where programme_id = p_programme_id;

  return jsonb_build_object('statut', 'SOUMIS', 'conformite', coalesce(rapport, '[]'::jsonb));
end;
$$;

create or replace function public.valider_programme_hebdomadaire(p_programme_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs';
  end if;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
    set statut = 'VALIDE', valide_at = now(), valide_par = auth.uid()
    where id = p_programme_id and statut = 'SOUMIS';

  if not found then
    raise exception 'Programme introuvable ou non soumis';
  end if;
end;
$$;

create or replace function public.rejeter_programme_hebdomadaire(p_programme_id uuid, p_motif text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs';
  end if;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
    set statut = 'BROUILLON', soumis_at = null
    where id = p_programme_id and statut = 'SOUMIS';

  if not found then
    raise exception 'Programme introuvable ou non soumis';
  end if;

  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select vm_id, 'PROGRAMME_REJETE', 'Programme renvoyé pour correction', coalesce(p_motif, 'Voir avec votre superviseur.'),
    jsonb_build_object('programme_id', p_programme_id)
  from public.programmes_hebdomadaires where id = p_programme_id;
end;
$$;

-- ============================================================
-- 3. FICHE JOURNALIÈRE — anti "visite en réserve"
-- ============================================================

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

create trigger visites_validate
  before insert on public.visites
  for each row execute function public.trg_visites_validate();

create unique index visites_unique_ligne on public.visites(programme_ligne_id) where programme_ligne_id is not null;

create or replace function public.trg_visites_guard_immutable()
returns trigger language plpgsql as $$
begin
  if (new.horodatage, new.latitude, new.longitude, new.jour, new.vm_id, new.client_id, new.programme_ligne_id)
     is distinct from (old.horodatage, old.latitude, old.longitude, old.jour, old.vm_id, old.client_id, old.programme_ligne_id) then
    raise exception 'Horodatage, géolocalisation, jour, VM, client et ligne de programme sont non modifiables après saisie';
  end if;
  return new;
end;
$$;

create trigger visites_guard_immutable
  before update on public.visites
  for each row execute function public.trg_visites_guard_immutable();

-- Motif de non-visite (saisi pendant la clôture, avant validation finale)
create or replace function public.trg_manquante_motifs_validate()
returns trigger language plpgsql as $$
declare
  ligne record;
  cloture record;
  bypass boolean;
begin
  bypass := coalesce(current_setting('graal.internal_rpc', true), 'off') = 'on';

  select pl.id, pl.jour, ph.vm_id as prog_vm_id, ph.semaine_debut
    into ligne
    from public.programme_lignes pl
    join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
    where pl.id = new.programme_ligne_id;

  if ligne is null then
    raise exception 'Ligne de programme introuvable';
  end if;

  if not bypass then
    if ligne.prog_vm_id <> auth.uid() and not public.is_admin() then
      raise exception 'Ligne de programme non autorisée';
    end if;

    if (ligne.semaine_debut + public.jour_offset(ligne.jour)) <> public.benin_today() then
      raise exception 'Un motif de non-visite ne peut être saisi que pour la journée en cours';
    end if;

    select * into cloture from public.clotures_journalieres
      where vm_id = ligne.prog_vm_id and jour = public.benin_today();
    if cloture is not null and cloture.statut <> 'EN_ATTENTE' then
      raise exception 'La journée est déjà clôturée';
    end if;
  end if;

  if exists (select 1 from public.visites v where v.programme_ligne_id = new.programme_ligne_id) then
    raise exception 'Cette visite a déjà été réalisée : aucun motif de non-visite requis';
  end if;

  if new.cree_par is null then
    new.cree_par := auth.uid();
  end if;

  return new;
end;
$$;

create trigger manquante_motifs_validate
  before insert on public.visite_manquante_motifs
  for each row execute function public.trg_manquante_motifs_validate();

-- Clôture de journée (19h) — porte d'entrée UNIQUE vers le statut CLOTUREE.
-- Bloque tant que chaque visite manquante n'a pas de motif, exige la photo de la fiche papier.
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

  return jsonb_build_object('statut', 'CLOTUREE', 'en_retard', v_en_retard, 'heure', now());
end;
$$;

-- Clôture forcée automatique (job planifié, cf. 014_cron.sql) — au-delà de l'heure limite,
-- toute visite programmée non saisie devient "Non faite / non justifiée".
create or replace function public.forcer_clotures_du_jour()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_jour date := public.benin_today();
  r record;
  motif_force uuid;
begin
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
        jsonb_build_object('vm_id', r.vm_id, 'jour', v_jour)
      from public.profiles where role = 'admin';
    end if;
  end loop;
end;
$$;

create or replace function public.verrouiller_programmes_semaine()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
    set statut = 'VERROUILLE'
    where statut = 'VALIDE' and semaine_debut <= public.benin_today();
end;
$$;

-- ============================================================
-- 4. PLAN D'ACTIVITÉS MENSUEL — délai du 25 du mois précédent
-- ============================================================

create or replace function public.trg_plan_activites_validate()
returns trigger language plpgsql as $$
declare
  limite date;
begin
  limite := (date_trunc('month', new.mois) - interval '1 month')::date + 24;
  if public.benin_today() > limite and not public.is_admin() then
    raise exception 'Délai dépassé : le plan d''activités doit être soumis au plus tard le 25 du mois précédent (limite : %)', limite;
  end if;
  return new;
end;
$$;

create trigger plan_activites_validate
  before insert on public.plans_activites_mensuels
  for each row execute function public.trg_plan_activites_validate();
