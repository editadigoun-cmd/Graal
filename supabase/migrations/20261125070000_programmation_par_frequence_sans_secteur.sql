-- La programmation des visites n'est plus limitée par le secteur.
CREATE OR REPLACE FUNCTION public.guard_secteur_ligne_programme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_secteur_soumission_programme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- Le contrôle des quotas journaliers continue de considérer tout le portefeuille.
CREATE OR REPLACE FUNCTION public.trg_programme_lignes_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  prog record; cl record; in_portefeuille boolean; derog_zone boolean; derog_potentiel boolean;
  derog_specialite boolean; nb_visites_jour int; nb_moyen_jour int; nb_gros_jour int;
  nb_faible_jour int; max_gros_jour int; max_faible_jour int; gros_moyen_disponible boolean;
  v_equipe_id uuid; v_odypharm2 boolean; v_quota int; v_compte int; v_total_pharmacies int;
BEGIN
  SELECT * INTO prog FROM public.programmes_hebdomadaires WHERE id = new.programme_id;
  IF prog IS NULL THEN RAISE EXCEPTION 'Programme hebdomadaire introuvable'; END IF;
  IF prog.statut <> 'BROUILLON' THEN
    RAISE EXCEPTION 'Le programme est au statut % : ses lignes ne peuvent plus être modifiées', prog.statut;
  END IF;
  SELECT * INTO cl FROM public.clients WHERE id = new.client_id;
  IF cl IS NULL THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF NOT cl.actif THEN RAISE EXCEPTION 'Client % désactivé, non programmable', cl.nom; END IF;

  SELECT EXISTS (SELECT 1 FROM public.portefeuille WHERE client_id = new.client_id AND vm_id = prog.vm_id)
    INTO in_portefeuille;
  derog_zone := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'ZONE');
  derog_potentiel := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'POTENTIEL');
  derog_specialite := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'SPECIALITE:GENERALISTE')
    AND cl.specialite = 'GENERALISTE'::public.specialite_client;
  SELECT equipe_id INTO v_equipe_id FROM public.profiles WHERE id = prog.vm_id;
  v_odypharm2 := v_equipe_id = 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid;

  IF NOT in_portefeuille AND (NOT derog_zone OR prog.mode_pharmacie_uniquement) AND NOT derog_specialite THEN
    RAISE EXCEPTION 'Le client "%" ne fait pas partie du portefeuille de ce VM', cl.nom;
  END IF;
  IF prog.mode_pharmacie_uniquement AND new.type_visite <> 'PHARMACIE' THEN
    RAISE EXCEPTION 'Semaine en mode "pharmacie uniquement" : seules les pharmacies sont programmables';
  END IF;
  IF new.type_visite = 'MEDICAL' AND cl.specialite = 'PHARMACIE' THEN
    RAISE EXCEPTION 'Type de visite incorrect : une pharmacie doit être ajoutée comme visite PHARMACIE';
  END IF;
  IF new.type_visite = 'PHARMACIE' AND cl.specialite <> 'PHARMACIE' THEN
    RAISE EXCEPTION 'Type de visite incorrect : seuls les clients pharmacie peuvent être ajoutés comme visite PHARMACIE';
  END IF;

  SELECT count(*) INTO nb_visites_jour
  FROM public.programme_lignes pl
  WHERE pl.programme_id = new.programme_id AND pl.jour = new.jour
    AND pl.id IS DISTINCT FROM new.id;
  IF NOT v_odypharm2 AND nb_visites_jour >= public.parametre_numeric('max_visites_jour', 22)::int THEN
    RAISE EXCEPTION 'Limite quotidienne atteinte : un VM ne peut pas programmer plus de 22 visites par jour';
  END IF;

  IF v_odypharm2 THEN
    IF new.type_visite = 'PHARMACIE' THEN
      SELECT quota INTO v_quota FROM public.quotas_pharmacie_journaliers
      WHERE equipe_id = v_equipe_id AND jour = new.jour AND potentiel = cl.potentiel;
      IF NOT FOUND OR v_quota <= 0 THEN
        RAISE EXCEPTION 'Le potentiel % n''est pas prévu pour les pharmacies le % dans ODYPHARM2.', coalesce(cl.potentiel::text, 'non renseigné'), new.jour;
      END IF;
      SELECT count(*) INTO v_compte
      FROM public.programme_lignes pl JOIN public.clients c ON c.id = pl.client_id
      WHERE pl.programme_id = new.programme_id AND pl.jour = new.jour
        AND pl.type_visite = 'PHARMACIE' AND c.potentiel = cl.potentiel
        AND pl.id IS DISTINCT FROM new.id;
      IF v_compte >= v_quota THEN
        RAISE EXCEPTION 'Quota % atteint pour les pharmacies le % : % visite(s).', cl.potentiel, new.jour, v_quota;
      END IF;
      SELECT count(*) INTO v_total_pharmacies
      FROM public.programme_lignes pl
      WHERE pl.programme_id = new.programme_id AND pl.jour = new.jour
        AND pl.type_visite = 'PHARMACIE' AND pl.id IS DISTINCT FROM new.id;
      IF v_total_pharmacies >= 15 THEN
        RAISE EXCEPTION 'Les 15 pharmacies du % sont déjà programmées. Les centres peuvent être ajoutés séparément.', new.jour;
      END IF;
    END IF;
  END IF;

  IF prog.vm_id IN ('62cdc900-5544-470a-94bf-ef30c9c8fb2f'::uuid, 'db3b946a-165e-4a20-91e0-073c2e170a72'::uuid)
     AND NOT prog.mode_pharmacie_uniquement AND NOT derog_potentiel
     AND new.jour IN ('LUNDI','MARDI','MERCREDI') THEN
    IF new.type_visite = 'MEDICAL' THEN
      SELECT count(*) FILTER (WHERE c2.potentiel = 'MOYEN' AND pl.type_visite = 'MEDICAL'),
             count(*) FILTER (WHERE c2.potentiel = 'FAIBLE' AND pl.type_visite = 'MEDICAL')
      INTO nb_moyen_jour, nb_faible_jour
      FROM public.programme_lignes pl JOIN public.clients c2 ON c2.id = pl.client_id
      WHERE pl.programme_id = new.programme_id AND pl.jour = new.jour
        AND pl.id IS DISTINCT FROM new.id;
      IF cl.potentiel = 'MOYEN' AND nb_moyen_jour >= 7 THEN
        RAISE EXCEPTION 'Quota MOYEN atteint : maximum 7 visites médicales par jour pour Lydie et Sylvestre';
      END IF;
      IF cl.potentiel = 'FAIBLE' AND nb_faible_jour >= 2 THEN
        RAISE EXCEPTION 'Quota FAIBLE atteint : maximum 2 visites médicales par jour pour Lydie et Sylvestre';
      END IF;
    END IF;
  ELSIF NOT v_odypharm2 AND NOT derog_potentiel AND NOT public.is_fawaz_vm(prog.vm_id)
    AND prog.vm_id NOT IN ('62cdc900-5544-470a-94bf-ef30c9c8fb2f'::uuid, 'db3b946a-165e-4a20-91e0-073c2e170a72'::uuid) THEN
    IF new.jour IN ('LUNDI', 'MARDI', 'MERCREDI') THEN
      IF cl.potentiel = 'FAIBLE' THEN
        RAISE EXCEPTION 'Du lundi au mercredi, seuls les potentiels GROS et MOYEN sont autorisés';
      END IF;
      SELECT count(*) INTO nb_moyen_jour
      FROM public.programme_lignes pl JOIN public.clients c2 ON c2.id = pl.client_id
      WHERE pl.programme_id = new.programme_id AND pl.jour = new.jour
        AND c2.potentiel = 'MOYEN' AND pl.id IS DISTINCT FROM new.id;
      IF cl.potentiel = 'MOYEN' AND nb_moyen_jour >= public.parametre_numeric('nb_max_moyen_lun_mar_mer_jour', 5)::int THEN
        RAISE EXCEPTION 'Quota MOYEN atteint le % : maximum 5 visites médicales et pharmacies confondues', new.jour;
      END IF;
    ELSIF new.jour IN ('JEUDI', 'VENDREDI') THEN
      max_gros_jour := CASE WHEN new.jour = 'JEUDI' THEN public.parametre_numeric('max_gros_jeudi', 8)::int ELSE public.parametre_numeric('max_gros_vendredi', 5)::int END;
      max_faible_jour := CASE WHEN new.jour = 'JEUDI' THEN public.parametre_numeric('max_faible_jeudi', 2)::int ELSE public.parametre_numeric('max_faible_vendredi', 3)::int END;
      SELECT count(*) FILTER (WHERE c2.potentiel = 'GROS'),
             count(*) FILTER (WHERE c2.potentiel = 'FAIBLE')
      INTO nb_gros_jour, nb_faible_jour
      FROM public.programme_lignes pl JOIN public.clients c2 ON c2.id = pl.client_id
      WHERE pl.programme_id = new.programme_id AND pl.jour = new.jour
        AND pl.id IS DISTINCT FROM new.id;
      IF cl.potentiel = 'GROS' AND nb_gros_jour >= max_gros_jour THEN
        RAISE EXCEPTION 'Quota GROS atteint le % : maximum %', new.jour, max_gros_jour;
      END IF;
      IF cl.potentiel = 'FAIBLE' AND nb_faible_jour >= max_faible_jour THEN
        SELECT EXISTS (
          SELECT 1 FROM public.portefeuille pf JOIN public.clients c3 ON c3.id = pf.client_id
          WHERE pf.vm_id = prog.vm_id AND c3.actif AND c3.potentiel IN ('GROS', 'MOYEN')
            AND NOT EXISTS (SELECT 1 FROM public.programme_lignes pl3
              WHERE pl3.programme_id = new.programme_id AND pl3.client_id = c3.id)
        ) INTO gros_moyen_disponible;
        IF gros_moyen_disponible THEN
          RAISE EXCEPTION 'Quota FAIBLE atteint le % : maximum % tant qu''il reste des clients GROS ou MOYEN éligibles dans le portefeuille', new.jour, max_faible_jour;
        END IF;
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.programme_lignes
    WHERE programme_id = new.programme_id AND client_id = new.client_id
      AND id IS DISTINCT FROM new.id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.derogations_doublon_client
    WHERE programme_id = new.programme_id AND client_id = new.client_id
  ) THEN
    RAISE EXCEPTION 'Le client "%" est déjà programmé cette semaine (dérogation administrateur requise pour un doublon)', cl.nom;
  END IF;
  RETURN new;
END;
$function$;

-- La fréquence mensuelle s'applique à tous les VM, sauf dérogation de fréquence active.
CREATE OR REPLACE FUNCTION public.verifier_frequence_client_programme()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vm uuid;
  v_semaine date;
  v_date_visite date;
  v_debut_mois date;
  v_fin_mois date;
  v_frequence integer;
  v_count_month integer;
  v_count_week integer;
BEGIN
  SELECT p.vm_id, p.semaine_debut INTO v_vm, v_semaine
  FROM public.programmes_hebdomadaires p WHERE p.id = NEW.programme_id;
  IF v_vm IS NULL THEN RAISE EXCEPTION 'Impossible de contrôler la fréquence : VM/programme introuvable.'; END IF;

  IF public.client_frequence_autorisee(v_vm, NEW.client_id, v_semaine) THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_count_week
  FROM public.programme_lignes pl
  JOIN public.programmes_hebdomadaires p ON p.id = pl.programme_id
  WHERE p.vm_id = v_vm AND p.semaine_debut = v_semaine AND pl.client_id = NEW.client_id
    AND pl.id IS DISTINCT FROM COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF v_count_week >= 1 THEN
    RAISE EXCEPTION 'Client déjà programmé cette semaine. Un même client ne peut être programmé qu''une seule fois par semaine.';
  END IF;

  v_date_visite := v_semaine + CASE NEW.jour
    WHEN 'LUNDI'::public.jour_semaine THEN 0 WHEN 'MARDI'::public.jour_semaine THEN 1
    WHEN 'MERCREDI'::public.jour_semaine THEN 2 WHEN 'JEUDI'::public.jour_semaine THEN 3
    WHEN 'VENDREDI'::public.jour_semaine THEN 4 WHEN 'SAMEDI'::public.jour_semaine THEN 5 ELSE 0 END;
  v_debut_mois := date_trunc('month', v_date_visite)::date;
  v_fin_mois := (date_trunc('month', v_date_visite) + interval '1 month')::date;

  SELECT c.frequence_visite_mensuelle INTO v_frequence
  FROM public.clients c WHERE c.id = NEW.client_id FOR UPDATE;
  IF v_frequence IS NULL OR v_frequence <= 0 THEN RETURN NEW; END IF;

  SELECT
    (SELECT count(*) FROM public.visites v
     WHERE v.vm_id = v_vm AND v.client_id = NEW.client_id
       AND v.statut IN ('REALISEE'::public.statut_visite, 'HORS_PROGRAMME'::public.statut_visite)
       AND v.jour >= v_debut_mois AND v.jour < v_fin_mois)
    +
    (SELECT count(*) FROM public.programme_lignes pl
     JOIN public.programmes_hebdomadaires p ON p.id = pl.programme_id
     WHERE p.vm_id = v_vm AND pl.client_id = NEW.client_id
       AND (p.semaine_debut + CASE pl.jour
         WHEN 'LUNDI'::public.jour_semaine THEN 0 WHEN 'MARDI'::public.jour_semaine THEN 1
         WHEN 'MERCREDI'::public.jour_semaine THEN 2 WHEN 'JEUDI'::public.jour_semaine THEN 3
         WHEN 'VENDREDI'::public.jour_semaine THEN 4 WHEN 'SAMEDI'::public.jour_semaine THEN 5 ELSE 0 END)
           >= GREATEST(v_debut_mois, public.benin_today())
       AND (p.semaine_debut + CASE pl.jour
         WHEN 'LUNDI'::public.jour_semaine THEN 0 WHEN 'MARDI'::public.jour_semaine THEN 1
         WHEN 'MERCREDI'::public.jour_semaine THEN 2 WHEN 'JEUDI'::public.jour_semaine THEN 3
         WHEN 'VENDREDI'::public.jour_semaine THEN 4 WHEN 'SAMEDI'::public.jour_semaine THEN 5 ELSE 0 END) < v_fin_mois
       AND pl.id IS DISTINCT FROM COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND NOT EXISTS (SELECT 1 FROM public.visites v WHERE v.programme_ligne_id = pl.id))
    INTO v_count_month;

  IF COALESCE(v_count_month, 0) >= v_frequence THEN
    RAISE EXCEPTION 'Fréquence mensuelle atteinte pour % : limite de % visite(s) ce mois-ci. Ce prescripteur ne peut plus être programmé.',
      (SELECT nom FROM public.clients WHERE id = NEW.client_id), v_frequence;
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.programmes_hebdomadaires SET secteur = NULL
WHERE statut = 'BROUILLON' AND secteur IS NOT NULL;
