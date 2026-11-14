CREATE OR REPLACE FUNCTION public.guard_secteur_ligne_programme()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secteur_programme public.secteur_code;
  v_secteur_client public.secteur_code;
  v_semaine date;
  v_vm_id uuid;
  v_equipe_id uuid;
  v_mode_pharmacie boolean;
  v_specialite public.specialite_client;
begin
  select secteur, semaine_debut, vm_id, mode_pharmacie_uniquement
    into v_secteur_programme, v_semaine, v_vm_id, v_mode_pharmacie
  from public.programmes_hebdomadaires where id = new.programme_id;
  select equipe_id into v_equipe_id from public.profiles where id = v_vm_id;
  select secteur, specialite into v_secteur_client, v_specialite
  from public.clients where id = new.client_id;
  if v_equipe_id = 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid then return new; end if;
  if coalesce(v_mode_pharmacie, false) then return new; end if;
  if exists (select 1 from public.programme_jours_validation pjv
    where pjv.programme_id = new.programme_id and pjv.jour = new.jour and pjv.statut = 'VALIDE') then return new; end if;
  if v_vm_id = '2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f'::uuid
     or public.is_fawaz_vm(v_vm_id) or v_vm_id = '96388406-e88e-4146-a372-1df07481c8e4'::uuid then return new; end if;
  if public.fusion_active(v_semaine, (select potentiel from public.clients where id = new.client_id)) then return new; end if;
  if public.derogation_planning_active(v_vm_id, v_semaine, 'SPECIALITE:GENERALISTE')
     and v_specialite = 'GENERALISTE'::public.specialite_client then return new; end if;
  if v_secteur_programme is null then raise exception 'Le secteur de ce programme n''est pas défini. Rechargez le planning ou contactez un administrateur.'; end if;
  if v_secteur_client is distinct from v_secteur_programme then
    raise exception 'Secteur interdit : ce programme est réservé au secteur %, mais ce client appartient au secteur %.', v_secteur_programme, coalesce(v_secteur_client::text, 'non défini');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_secteur_soumission_programme()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.statut is distinct from old.statut and new.statut = 'VALIDE'::public.statut_programme and public.is_admin() then return new; end if;
  if new.statut is distinct from old.statut and new.statut in ('SOUMIS'::public.statut_programme, 'VALIDE'::public.statut_programme) then
    if exists (select 1 from public.profiles p where p.id = new.vm_id and p.equipe_id = 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid) then return new; end if;
    if new.secteur is null and not public.derogation_planning_active(new.vm_id, new.semaine_debut, 'ZONE') then
      raise exception 'Impossible de soumettre un programme sans secteur défini.';
    end if;
    if new.vm_id <> '2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f'::uuid
      and not public.is_fawaz_vm(new.vm_id) and new.vm_id <> '96388406-e88e-4146-a372-1df07481c8e4'::uuid
      and not public.derogation_planning_active(new.vm_id, new.semaine_debut, 'ZONE')
      and exists (
        select 1 from public.programme_lignes pl join public.clients c on c.id = pl.client_id
        where pl.programme_id = new.id
          and not exists (select 1 from public.programme_jours_validation pjv where pjv.programme_id = pl.programme_id and pjv.jour = pl.jour and pjv.statut = 'VALIDE')
          and not public.fusion_active(new.semaine_debut, c.potentiel)
          and c.secteur is distinct from new.secteur
          and not (c.specialite = 'GENERALISTE'::public.specialite_client and public.derogation_planning_active(new.vm_id, new.semaine_debut, 'SPECIALITE:GENERALISTE'))
      ) then
      raise exception 'Programme non conforme au secteur % : une dérogation de zone est nécessaire pour cette semaine.', new.secteur;
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_programme_lignes_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  prog record;
  cl record;
  in_portefeuille boolean;
  derog_zone boolean;
  derog_potentiel boolean;
  derog_specialite boolean;
  nb_visites_jour int;
  nb_moyen_jour int;
  nb_gros_jour int;
  nb_faible_jour int;
  max_gros_jour int;
  max_faible_jour int;
  gros_moyen_disponible boolean;
  v_equipe_id uuid;
  v_odypharm2 boolean;
  v_quota int;
  v_compte int;
  v_total_pharmacies int;
begin
  select * into prog from public.programmes_hebdomadaires where id = new.programme_id;
  if prog is null then raise exception 'Programme hebdomadaire introuvable'; end if;
  if prog.statut <> 'BROUILLON' then
    raise exception 'Le programme est au statut % : ses lignes ne peuvent plus être modifiées', prog.statut;
  end if;
  select * into cl from public.clients where id = new.client_id;
  if cl is null then raise exception 'Client introuvable'; end if;
  if not cl.actif then raise exception 'Client % désactivé, non programmable', cl.nom; end if;

  select exists (select 1 from public.portefeuille where client_id = new.client_id and vm_id = prog.vm_id)
    into in_portefeuille;
  derog_zone := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'ZONE');
  derog_potentiel := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'POTENTIEL');
  derog_specialite := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'SPECIALITE:GENERALISTE')
    and cl.specialite = 'GENERALISTE'::public.specialite_client;
  select equipe_id into v_equipe_id from public.profiles where id = prog.vm_id;
  v_odypharm2 := v_equipe_id = 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid;

  if not in_portefeuille and (not derog_zone or prog.mode_pharmacie_uniquement) and not derog_specialite then
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

  select count(*) into nb_visites_jour from public.programme_lignes pl
  where pl.programme_id = new.programme_id and pl.jour = new.jour
    and pl.id is distinct from new.id;
  if not v_odypharm2 and nb_visites_jour >= public.parametre_numeric('max_visites_jour', 22)::int then
    raise exception 'Limite quotidienne atteinte : un VM ne peut pas programmer plus de 22 visites par jour';
  end if;


  if v_odypharm2 then
    if new.type_visite = 'MEDICAL' and cl.specialite not in ('MATERNITE'::public.specialite_client, 'DISPENSAIRE'::public.specialite_client) then
      raise exception 'ODYPHARM2 peut ajouter uniquement les centres de santé de son portefeuille en visite complémentaire.';
    end if;
    if new.type_visite = 'PHARMACIE' then
      select quota into v_quota from public.quotas_pharmacie_journaliers
      where equipe_id = v_equipe_id and jour = new.jour and potentiel = cl.potentiel;
      if not found or v_quota <= 0 then
        raise exception 'Le potentiel % n''est pas prévu pour les pharmacies le % dans ODYPHARM2.', coalesce(cl.potentiel::text, 'non renseigné'), new.jour;
      end if;
      select count(*) into v_compte from public.programme_lignes pl join public.clients c on c.id = pl.client_id
      where pl.programme_id = new.programme_id and pl.jour = new.jour and pl.type_visite = 'PHARMACIE'
        and c.potentiel = cl.potentiel and pl.id is distinct from new.id;
      if v_compte >= v_quota then raise exception 'Quota % atteint pour les pharmacies le % : % visite(s).', cl.potentiel, new.jour, v_quota; end if;
      select count(*) into v_total_pharmacies from public.programme_lignes pl
      where pl.programme_id = new.programme_id and pl.jour = new.jour and pl.type_visite = 'PHARMACIE' and pl.id is distinct from new.id;
      if v_total_pharmacies >= 15 then raise exception 'Les 15 pharmacies du % sont déjà programmées. Les centres peuvent être ajoutés séparément.', new.jour; end if;
    end if;
  end if;

  if not v_odypharm2 and not derog_potentiel and not public.is_fawaz_vm(prog.vm_id) then
    if new.jour in ('LUNDI', 'MARDI', 'MERCREDI') then
      if cl.potentiel = 'FAIBLE' then
        raise exception 'Du lundi au mercredi, seuls les potentiels GROS et MOYEN sont autorisés';
      end if;
      select count(*) into nb_moyen_jour
      from public.programme_lignes pl join public.clients c2 on c2.id = pl.client_id
      where pl.programme_id = new.programme_id and pl.jour = new.jour
        and c2.potentiel = 'MOYEN' and pl.id is distinct from new.id;
      if cl.potentiel = 'MOYEN' and nb_moyen_jour >= public.parametre_numeric('nb_max_moyen_lun_mar_mer_jour', 5)::int then
        raise exception 'Quota MOYEN atteint le % : maximum 5 visites médicales et pharmacies confondues', new.jour;
      end if;
    elsif new.jour in ('JEUDI', 'VENDREDI') then
      max_gros_jour := case when new.jour = 'JEUDI' then public.parametre_numeric('max_gros_jeudi', 8)::int else public.parametre_numeric('max_gros_vendredi', 5)::int end;
      max_faible_jour := case when new.jour = 'JEUDI' then public.parametre_numeric('max_faible_jeudi', 2)::int else public.parametre_numeric('max_faible_vendredi', 3)::int end;
      select count(*) filter (where c2.potentiel = 'GROS'),
             count(*) filter (where c2.potentiel = 'FAIBLE')
        into nb_gros_jour, nb_faible_jour
      from public.programme_lignes pl join public.clients c2 on c2.id = pl.client_id
      where pl.programme_id = new.programme_id and pl.jour = new.jour
        and pl.id is distinct from new.id;
      if cl.potentiel = 'GROS' and nb_gros_jour >= max_gros_jour then
        raise exception 'Quota GROS atteint le % : maximum %', new.jour, max_gros_jour;
      end if;
      if cl.potentiel = 'FAIBLE' and nb_faible_jour >= max_faible_jour then
        select exists (
          select 1 from public.portefeuille pf join public.clients c3 on c3.id = pf.client_id
          where pf.vm_id = prog.vm_id and c3.actif and c3.potentiel in ('GROS', 'MOYEN')
            and (derog_zone or c3.secteur is not distinct from prog.secteur)
            and not exists (select 1 from public.programme_lignes pl3
              where pl3.programme_id = new.programme_id and pl3.client_id = c3.id)
        ) into gros_moyen_disponible;
        if gros_moyen_disponible then
          raise exception 'Quota FAIBLE atteint le % : maximum % tant qu''il reste des clients GROS ou MOYEN éligibles dans le portefeuille', new.jour, max_faible_jour;
        end if;
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.programme_lignes
    where programme_id = new.programme_id and client_id = new.client_id
      and id is distinct from new.id
  ) and not exists (
    select 1 from public.derogations_doublon_client
    where programme_id = new.programme_id and client_id = new.client_id
  ) then
    raise exception 'Le client "%" est déjà programmé cette semaine (dérogation administrateur requise pour un doublon)', cl.nom;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.soumettre_jour_programme(p_programme_id uuid, p_jour jour_semaine)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_programme public.programmes_hebdomadaires%rowtype;
  v_etat public.programme_jours_validation%rowtype;
  v_count integer;
  v_medical integer;
  v_pharmacie integer;
  v_min_medical integer;
  v_min_pharmacie integer;
  v_equipe_id uuid;
  v_odypharm2 boolean;
BEGIN
  SELECT * INTO v_programme FROM public.programmes_hebdomadaires WHERE id = p_programme_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programme introuvable.'; END IF;
  IF v_programme.vm_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Vous ne pouvez soumettre que votre propre programme.';
  END IF;
  IF v_programme.statut NOT IN ('BROUILLON','SOUMIS') THEN
    RAISE EXCEPTION 'Ce programme n’est plus modifiable.';
  END IF;
  SELECT * INTO v_etat FROM public.programme_jours_validation
    WHERE programme_id=p_programme_id AND jour=p_jour;
  IF v_etat.statut='VALIDE' THEN RAISE EXCEPTION 'Cette journée est déjà validée.'; END IF;
  IF v_etat.date_limite IS NOT NULL AND now()>v_etat.date_limite
     AND (v_programme.delai_supplementaire_jusqu_a IS NULL OR now()>v_programme.delai_supplementaire_jusqu_a) THEN
    RAISE EXCEPTION 'Le délai de soumission de cette journée est dépassé.';
  END IF;

  SELECT equipe_id INTO v_equipe_id FROM public.profiles WHERE id=v_programme.vm_id;
  v_odypharm2 := v_equipe_id = 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid;

  SELECT count(*),
    count(*) FILTER (WHERE type_visite='MEDICAL'),
    count(*) FILTER (WHERE type_visite='PHARMACIE')
  INTO v_count, v_medical, v_pharmacie
  FROM public.programme_lignes WHERE programme_id=p_programme_id AND jour=p_jour;

  IF v_count=0 THEN RAISE EXCEPTION 'Ajoutez au moins un client à cette journée avant de la soumettre.'; END IF;


  IF v_odypharm2 AND p_jour IN ('LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI') THEN
    IF v_pharmacie<>15 THEN RAISE EXCEPTION 'ODYPHARM2 : % pharmacies programmées le % ; 15 sont obligatoires.',v_pharmacie,p_jour; END IF;
    IF EXISTS (
      SELECT 1 FROM public.quotas_pharmacie_journaliers q
      LEFT JOIN (SELECT c.potentiel,count(*) AS n FROM public.programme_lignes pl JOIN public.clients c ON c.id=pl.client_id
        WHERE pl.programme_id=p_programme_id AND pl.jour=p_jour AND pl.type_visite='PHARMACIE' GROUP BY c.potentiel) x ON x.potentiel=q.potentiel
      WHERE q.equipe_id=v_equipe_id AND q.jour=p_jour AND coalesce(x.n,0)<>q.quota
    ) THEN RAISE EXCEPTION 'La répartition des potentiels des 15 pharmacies ne respecte pas le quota ODYPHARM2 du %.',p_jour; END IF;
  END IF;

  IF p_jour IN ('LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI')
     AND NOT v_programme.mode_pharmacie_uniquement AND NOT v_odypharm2
     AND v_programme.vm_id NOT IN ('e86efe52-ed01-4d04-8eec-e539fd1e4b30'::uuid, 'bb2519e6-04d8-4740-b878-a0b999ad7606'::uuid) THEN
    v_min_medical := public.parametre_numeric('visites_minimum_medical_jour',15);
    v_min_pharmacie := public.parametre_numeric('visites_minimum_pharmacie_jour',3);
    IF v_medical < v_min_medical
       OR (NOT public.is_fawaz_vm(v_programme.vm_id) AND v_pharmacie < v_min_pharmacie) THEN
      RAISE EXCEPTION 'Minimum non atteint : % visites médicales (minimum %), % pharmacies (minimum %).',
        v_medical, v_min_medical, v_pharmacie, v_min_pharmacie;
    END IF;
  END IF;

  INSERT INTO public.programme_jours_validation(programme_id,jour,statut,soumis_at,updated_at)
    VALUES(p_programme_id,p_jour,'SOUMIS',now(),now())
    ON CONFLICT(programme_id,jour) DO UPDATE
      SET statut='SOUMIS',soumis_at=now(),updated_at=now()
      WHERE public.programme_jours_validation.statut <> 'VALIDE';

  RETURN jsonb_build_object('statut','SOUMIS','programme_id',p_programme_id,'jour',p_jour,'clients',v_count,
    'visites_medicales',v_medical,'visites_pharmacie',v_pharmacie);
END;
$function$;

CREATE OR REPLACE FUNCTION public.soumettre_programme_hebdomadaire(p_programme_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prog record;
  deadline timestamptz;
  deadline_hour text;
  deadline_day text;
  deadline_offset int;
  min_medical_jour int;
  min_pharmacie_jour int;
  v_equipe_id uuid;
  v_odypharm2 boolean;
  v_jour public.jour_semaine;
  v_pharmacie integer;
  r record;
  rapport jsonb;
BEGIN
  SELECT * INTO prog FROM public.programmes_hebdomadaires WHERE id = p_programme_id;
  IF prog IS NULL THEN RAISE EXCEPTION 'Programme introuvable'; END IF;
  IF prog.vm_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Action non autorisée'; END IF;
  IF prog.statut <> 'BROUILLON' THEN RAISE EXCEPTION 'Programme déjà soumis (statut %)', prog.statut; END IF;

  SELECT equipe_id INTO v_equipe_id FROM public.profiles WHERE id=prog.vm_id;
  v_odypharm2 := v_equipe_id = 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid;

  deadline_hour := coalesce(public.parametre_text('heure_limite_soumission_programme', '14:00'), '14:00');
  deadline_day := upper(coalesce(public.parametre_text('jour_limite_soumission_programme', 'SAMEDI'), 'SAMEDI'));
  deadline_offset := CASE deadline_day
    WHEN 'LUNDI' THEN -7 WHEN 'MARDI' THEN -6 WHEN 'MERCREDI' THEN -5
    WHEN 'JEUDI' THEN -4 WHEN 'VENDREDI' THEN -3 WHEN 'SAMEDI' THEN -2
    WHEN 'DIMANCHE' THEN -1 ELSE -2 END;
  deadline := (((prog.semaine_debut + deadline_offset) + deadline_hour::time)::timestamp AT TIME ZONE 'Africa/Porto-Novo');
  IF prog.delai_supplementaire_jusqu_a IS NOT NULL AND prog.delai_supplementaire_jusqu_a > deadline THEN deadline := prog.delai_supplementaire_jusqu_a; END IF;
  IF now() > deadline AND NOT public.is_admin() THEN
    INSERT INTO public.notifications (profile_id, type, titre, corps, metadata)
    SELECT id, 'SOUMISSION_HORS_DELAI', 'Tentative de soumission hors délai',
      format('%s a tenté de soumettre son programme de la semaine du %s après le délai (%s %s, heure du Bénin).',
        coalesce((SELECT full_name FROM public.profiles WHERE id = prog.vm_id), 'Un VM'), prog.semaine_debut, lower(deadline_day), deadline_hour),
      jsonb_build_object('programme_id', prog.id, 'vm_id', prog.vm_id, 'tentative_a', public.benin_now())
    FROM public.profiles WHERE role = 'admin';
    RETURN jsonb_build_object('statut', 'REJETE_HORS_DELAI',
      'message', format('Délai de soumission dépassé : le programme devait être soumis avant %s %s (heure du Bénin)', lower(deadline_day), deadline_hour));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.programme_lignes WHERE programme_id = p_programme_id) THEN RAISE EXCEPTION 'Le programme est vide'; END IF;

  IF v_odypharm2 THEN
    FOREACH v_jour IN ARRAY ARRAY['LUNDI'::public.jour_semaine,'MARDI'::public.jour_semaine,'MERCREDI'::public.jour_semaine,'JEUDI'::public.jour_semaine,'VENDREDI'::public.jour_semaine] LOOP
      SELECT count(*) INTO v_pharmacie FROM public.programme_lignes WHERE programme_id=p_programme_id AND jour=v_jour AND type_visite='PHARMACIE';
      IF v_pharmacie<>15 THEN RAISE EXCEPTION 'ODYPHARM2 : % pharmacies programmées le % ; 15 sont obligatoires.',v_pharmacie,v_jour; END IF;
      IF EXISTS (
        SELECT 1 FROM public.quotas_pharmacie_journaliers q
        LEFT JOIN (SELECT c.potentiel,count(*) AS n FROM public.programme_lignes pl JOIN public.clients c ON c.id=pl.client_id
          WHERE pl.programme_id=p_programme_id AND pl.jour=v_jour AND pl.type_visite='PHARMACIE' GROUP BY c.potentiel) x ON x.potentiel=q.potentiel
        WHERE q.equipe_id=v_equipe_id AND q.jour=v_jour AND coalesce(x.n,0)<>q.quota
      ) THEN RAISE EXCEPTION 'La répartition des potentiels des pharmacies ne respecte pas le quota ODYPHARM2 du %.',v_jour; END IF;
    END LOOP;
  END IF;

  IF NOT v_odypharm2 AND EXISTS (SELECT 1 FROM public.programme_lignes WHERE programme_id = p_programme_id GROUP BY jour HAVING count(*) > public.parametre_numeric('max_visites_jour', 22)::int) THEN
    RAISE EXCEPTION 'Limite quotidienne dépassée : un VM ne peut pas programmer plus de 22 visites par jour';
  END IF;

  IF NOT v_odypharm2 AND NOT prog.mode_pharmacie_uniquement AND prog.vm_id NOT IN ('e86efe52-ed01-4d04-8eec-e539fd1e4b30'::uuid, 'bb2519e6-04d8-4740-b878-a0b999ad7606'::uuid) THEN
    min_medical_jour := public.parametre_numeric('visites_minimum_medical_jour', 15);
    min_pharmacie_jour := public.parametre_numeric('visites_minimum_pharmacie_jour', 3);
    IF (SELECT count(DISTINCT jour) FROM public.programme_lignes WHERE programme_id = p_programme_id) < 5 THEN
      RAISE EXCEPTION 'Le programme doit couvrir les 5 jours de la semaine (Lundi à Vendredi)';
    END IF;
    FOR r IN
      SELECT pl.jour,
        count(*) FILTER (WHERE pl.type_visite = 'MEDICAL') AS nb_medical,
        count(*) FILTER (WHERE pl.type_visite = 'PHARMACIE') AS nb_pharmacie
      FROM public.programme_lignes pl
      WHERE pl.programme_id = p_programme_id
      GROUP BY pl.jour
    LOOP
      IF r.nb_medical < min_medical_jour
         OR (NOT public.is_fawaz_vm(prog.vm_id) AND r.nb_pharmacie < min_pharmacie_jour) THEN
        RAISE EXCEPTION 'Minimum non atteint le % : % visites médicales (minimum %), % pharmacies (minimum %)',
          r.jour, r.nb_medical, min_medical_jour, r.nb_pharmacie, min_pharmacie_jour;
      END IF;
    END LOOP;
  END IF;

  SELECT equipe_id INTO v_equipe_id FROM public.profiles WHERE id = prog.vm_id;
  DELETE FROM public.programme_conformite WHERE programme_id = p_programme_id;
  INSERT INTO public.programme_conformite (programme_id, cible, quota_attendu, quantite_programmee, statut)
  SELECT p_programme_id, qc.cible, qc.quota_hebdomadaire, coalesce(cnt.n, 0),
    CASE WHEN coalesce(cnt.n, 0) = qc.quota_hebdomadaire THEN 'CONFORME'
         WHEN coalesce(cnt.n, 0) < qc.quota_hebdomadaire THEN 'SOUS_COUVERT' ELSE 'SUR_COUVERT' END
  FROM (
    SELECT cible, quota_hebdomadaire FROM public.vm_quotas_cibles WHERE vm_id = prog.vm_id
    UNION ALL
    SELECT q.cible, q.quota_hebdomadaire FROM public.quotas_cibles q
    WHERE q.equipe_id = v_equipe_id
      AND NOT EXISTS (SELECT 1 FROM public.vm_quotas_cibles vq WHERE vq.vm_id = prog.vm_id)
  ) qc
  LEFT JOIN (
    SELECT public.cible_pour_specialite(v_equipe_id, cl.specialite) AS cible, count(*) AS n
    FROM public.programme_lignes pl JOIN public.clients cl ON cl.id = pl.client_id
    WHERE pl.programme_id = p_programme_id GROUP BY 1
  ) cnt ON cnt.cible = qc.cible;

  PERFORM set_config('graal.internal_rpc', 'on', true);
  UPDATE public.programmes_hebdomadaires SET statut = 'SOUMIS', soumis_at = now() WHERE id = p_programme_id;
  SELECT jsonb_agg(to_jsonb(pc) - 'id' - 'programme_id') INTO rapport FROM public.programme_conformite pc WHERE programme_id = p_programme_id;
  RETURN jsonb_build_object('statut', 'SOUMIS', 'conformite', coalesce(rapport, '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_programmes_check_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_equipe uuid;
  v_mois date;
begin
  select equipe_id into v_equipe from public.profiles where id = new.vm_id;
  v_mois := date_trunc('month', new.semaine_debut)::date;
  if v_equipe = 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid and v_mois = '2026-11-01'::date then return new; end if;
  if v_equipe is not null and not public.plan_active_equipe_mois(v_equipe, v_mois) then
    raise exception 'Aucun plan d''activités mensuel soumis pour cette équipe (mois de %) : programmation bloquée jusqu''à soumission par le superviseur',
      to_char(v_mois, 'TMMonth YYYY');
  end if;
  return new;
end;
$function$;
