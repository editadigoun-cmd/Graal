CREATE OR REPLACE FUNCTION public.soumettre_programme_hebdomadaire(p_programme_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  prog record; deadline timestamptz; deadline_hour text; deadline_day text; deadline_offset int;
  min_medical_jour int; min_pharmacie_jour int; v_equipe_id uuid; r record; rapport jsonb;
BEGIN
  SELECT * INTO prog FROM public.programmes_hebdomadaires WHERE id = p_programme_id;
  IF prog IS NULL THEN RAISE EXCEPTION 'Programme introuvable'; END IF;
  IF prog.vm_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Action non autorisée'; END IF;
  IF prog.statut <> 'BROUILLON' THEN RAISE EXCEPTION 'Programme déjà soumis (statut %)', prog.statut; END IF;
  deadline_hour := coalesce(public.parametre_text('heure_limite_soumission_programme', '14:00'), '14:00');
  deadline_day := upper(coalesce(public.parametre_text('jour_limite_soumission_programme', 'SAMEDI'), 'SAMEDI'));
  deadline_offset := CASE deadline_day WHEN 'LUNDI' THEN -7 WHEN 'MARDI' THEN -6 WHEN 'MERCREDI' THEN -5 WHEN 'JEUDI' THEN -4 WHEN 'VENDREDI' THEN -3 WHEN 'SAMEDI' THEN -2 WHEN 'DIMANCHE' THEN -1 ELSE -2 END;
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
  IF EXISTS (SELECT 1 FROM public.programme_lignes WHERE programme_id = p_programme_id GROUP BY jour HAVING count(*) > public.parametre_numeric('max_visites_jour', 22)::int) THEN
    RAISE EXCEPTION 'Limite quotidienne dépassée : un VM ne peut pas programmer plus de 22 visites par jour';
  END IF;
  IF NOT prog.mode_pharmacie_uniquement AND prog.vm_id NOT IN ('e86efe52-ed01-4d04-8eec-e539fd1e4b30'::uuid, 'bb2519e6-04d8-4740-b878-a0b999ad7606'::uuid) THEN
    min_medical_jour := public.parametre_numeric('visites_minimum_medical_jour', 15);
    min_pharmacie_jour := public.parametre_numeric('visites_minimum_pharmacie_jour', 3);
    IF (SELECT count(DISTINCT jour) FROM public.programme_lignes WHERE programme_id = p_programme_id) < 5 THEN
      RAISE EXCEPTION 'Le programme doit couvrir les 5 jours de la semaine (Lundi à Vendredi)';
    END IF;
    FOR r IN
      SELECT pl.jour, count(*) FILTER (WHERE pl.type_visite = 'MEDICAL') AS nb_medical,
        count(*) FILTER (WHERE pl.type_visite = 'PHARMACIE') AS nb_pharmacie
      FROM public.programme_lignes pl WHERE pl.programme_id = p_programme_id GROUP BY pl.jour
    LOOP
      IF r.nb_medical < min_medical_jour OR (NOT public.is_fawaz_vm(prog.vm_id) AND r.nb_pharmacie < min_pharmacie_jour) THEN
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
    WHERE q.equipe_id = v_equipe_id AND NOT EXISTS (SELECT 1 FROM public.vm_quotas_cibles vq WHERE vq.vm_id = prog.vm_id)
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

CREATE OR REPLACE FUNCTION public.soumettre_jour_programme(p_programme_id uuid, p_jour public.jour_semaine)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_programme public.programmes_hebdomadaires%rowtype; v_etat public.programme_jours_validation%rowtype;
  v_count integer; v_medical integer; v_pharmacie integer; v_min_medical integer; v_min_pharmacie integer;
BEGIN
  SELECT * INTO v_programme FROM public.programmes_hebdomadaires WHERE id=p_programme_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programme introuvable.'; END IF;
  IF v_programme.vm_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'Vous ne pouvez soumettre que votre propre programme.'; END IF;
  IF v_programme.statut NOT IN ('BROUILLON','SOUMIS') THEN RAISE EXCEPTION 'Ce programme n’est plus modifiable.'; END IF;
  SELECT * INTO v_etat FROM public.programme_jours_validation WHERE programme_id=p_programme_id AND jour=p_jour;
  IF v_etat.statut='VALIDE' THEN RAISE EXCEPTION 'Cette journée est déjà validée.'; END IF;
  IF v_etat.date_limite IS NOT NULL AND now()>v_etat.date_limite
     AND (v_programme.delai_supplementaire_jusqu_a IS NULL OR now()>v_programme.delai_supplementaire_jusqu_a) THEN
    RAISE EXCEPTION 'Le délai de soumission de cette journée est dépassé.';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE type_visite='MEDICAL'), count(*) FILTER (WHERE type_visite='PHARMACIE')
  INTO v_count, v_medical, v_pharmacie FROM public.programme_lignes WHERE programme_id=p_programme_id AND jour=p_jour;
  IF v_count=0 THEN RAISE EXCEPTION 'Ajoutez au moins un client à cette journée avant de la soumettre.'; END IF;
  IF p_jour IN ('LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI') AND NOT v_programme.mode_pharmacie_uniquement
     AND v_programme.vm_id NOT IN ('e86efe52-ed01-4d04-8eec-e539fd1e4b30'::uuid, 'bb2519e6-04d8-4740-b878-a0b999ad7606'::uuid) THEN
    v_min_medical := public.parametre_numeric('visites_minimum_medical_jour',15);
    v_min_pharmacie := public.parametre_numeric('visites_minimum_pharmacie_jour',3);
    IF v_medical < v_min_medical OR (NOT public.is_fawaz_vm(v_programme.vm_id) AND v_pharmacie < v_min_pharmacie) THEN
      RAISE EXCEPTION 'Minimum non atteint : % visites médicales (minimum %), % pharmacies (minimum %).', v_medical, v_min_medical, v_pharmacie, v_min_pharmacie;
    END IF;
  END IF;
  INSERT INTO public.programme_jours_validation(programme_id,jour,statut,soumis_at,updated_at)
    VALUES(p_programme_id,p_jour,'SOUMIS',now(),now())
    ON CONFLICT(programme_id,jour) DO UPDATE SET statut='SOUMIS',soumis_at=now(),updated_at=now()
      WHERE public.programme_jours_validation.statut <> 'VALIDE';
  RETURN jsonb_build_object('statut','SOUMIS','programme_id',p_programme_id,'jour',p_jour,'clients',v_count,'visites_medicales',v_medical,'visites_pharmacie',v_pharmacie);
END;
$function$;
