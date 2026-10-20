-- Migration appliquée sur Supabase : exceptions pour jours déjà validés et récapitulatif quotidien 20h.

CREATE OR REPLACE FUNCTION public.guard_secteur_ligne_programme()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secteur_programme public.secteur_code;
  v_secteur_client public.secteur_code;
  v_semaine date;
  v_potentiel public.potentiel_client;
BEGIN
  SELECT secteur, semaine_debut INTO v_secteur_programme, v_semaine
  FROM public.programmes_hebdomadaires WHERE id = NEW.programme_id;
  SELECT secteur, potentiel INTO v_secteur_client, v_potentiel
  FROM public.clients WHERE id = NEW.client_id;

  -- Les jours déjà validés sont figés dans leur état historique : l'exception ne vaut
  -- que pour ces jours, pas pour les trois jours encore modifiables.
  IF EXISTS (
    SELECT 1 FROM public.programme_jours_validation pjv
    WHERE pjv.programme_id = NEW.programme_id
      AND pjv.jour = NEW.jour
      AND pjv.statut = 'VALIDE'
  ) THEN
    RETURN NEW;
  END IF;

  IF public.fusion_active(v_semaine, v_potentiel) THEN RETURN NEW; END IF;
  IF v_secteur_programme IS NULL THEN
    RAISE EXCEPTION 'Le secteur de ce programme n''est pas défini. Rechargez le planning ou contactez un administrateur.';
  END IF;
  IF v_secteur_client IS DISTINCT FROM v_secteur_programme THEN
    RAISE EXCEPTION 'Secteur interdit : ce programme est réservé au secteur %, mais ce client appartient au secteur %.',
      v_secteur_programme, coalesce(v_secteur_client::text, 'non défini');
  END IF;
  RETURN NEW;
END;
$function$

;
CREATE OR REPLACE FUNCTION public.guard_secteur_soumission_programme()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.statut IS DISTINCT FROM OLD.statut AND NEW.statut IN ('SOUMIS'::public.statut_programme, 'VALIDE'::public.statut_programme) THEN
    IF NEW.secteur IS NULL THEN
      RAISE EXCEPTION 'Impossible de soumettre un programme sans secteur défini.';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.programme_lignes pl
      JOIN public.clients c ON c.id = pl.client_id
      WHERE pl.programme_id = NEW.id
        -- Les écarts des jours déjà validés sont conservés; contrôle strict des jours restants.
        AND NOT EXISTS (
          SELECT 1 FROM public.programme_jours_validation pjv
          WHERE pjv.programme_id = pl.programme_id
            AND pjv.jour = pl.jour
            AND pjv.statut = 'VALIDE'
        )
        AND NOT public.fusion_active(NEW.semaine_debut, c.potentiel)
        AND c.secteur IS DISTINCT FROM NEW.secteur
    ) THEN
      RAISE EXCEPTION 'Programme non conforme : pour les jours non encore validés, retirez les clients qui ne correspondent pas au secteur % avant la soumission.', NEW.secteur;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$

;
CREATE OR REPLACE FUNCTION public.envoyer_rapports_visites_non_effectuees()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_jour date := public.benin_today();
  v_vm record;
  v_recipient record;
  v_prevu integer;
  v_realise integer;
  v_non_realise integer;
  v_liste_non_realisees text;
  v_liste_toutes text;
  v_corps text;
  v_envoyes integer := 0;
  v_notifications integer := 0;
BEGIN
  IF extract(isodow from v_jour) NOT BETWEEN 1 AND 5 THEN
    RETURN jsonb_build_object('status','skipped_weekend','jour',v_jour);
  END IF;

  FOR v_vm IN
    SELECT p.id, p.full_name, p.email, p.equipe_id
    FROM public.profiles p
    WHERE p.role = 'vm' AND p.actif = true
    ORDER BY p.full_name
  LOOP
    INSERT INTO public.rapports_visites_non_effectuees_envois(jour, vm_id)
    VALUES (v_jour, v_vm.id)
    ON CONFLICT (jour, vm_id) DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.visites v
        WHERE v.programme_ligne_id = pl.id AND v.jour = v_jour
      ))::integer,
      string_agg(
        '- ' || replace(replace(replace(coalesce(c.nom, 'Client sans nom'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
        '<br>' ORDER BY public.jour_offset(pl.jour), pl.ordre
      ) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM public.visites v
        WHERE v.programme_ligne_id = pl.id AND v.jour = v_jour
      )),
      string_agg(
        '- ' || replace(replace(replace(coalesce(c.nom, 'Client sans nom'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
        '<br>' ORDER BY public.jour_offset(pl.jour), pl.ordre
      )
    INTO v_prevu, v_realise, v_liste_non_realisees, v_liste_toutes
    FROM public.programme_lignes pl
    JOIN public.programmes_hebdomadaires ph ON ph.id = pl.programme_id
    LEFT JOIN public.clients c ON c.id = pl.client_id
    WHERE ph.vm_id = v_vm.id
      AND (
        ph.statut IN ('VALIDE', 'VERROUILLE')
        OR EXISTS (
          SELECT 1 FROM public.programme_jours_validation pjv
          WHERE pjv.programme_id = ph.id AND pjv.jour = pl.jour AND pjv.statut = 'VALIDE'
        )
      )
      AND (
        ph.semaine_debut + public.jour_offset(pl.jour) = v_jour
        OR EXISTS (
          SELECT 1 FROM public.visites_reportees vr
          WHERE vr.programme_ligne_id = pl.id AND vr.jour_report = v_jour
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.visites_reportees vr
        WHERE vr.programme_ligne_id = pl.id AND vr.jour_report > v_jour
      );

    v_prevu := coalesce(v_prevu, 0);
    v_realise := coalesce(v_realise, 0);
    v_non_realise := greatest(v_prevu - v_realise, 0);

    v_corps := format(
      'Récapitulatif du %s pour %s.<br><br>Visites prévues : <strong>%s</strong><br>Clients rencontrés : <strong>%s</strong><br>Clients non rencontrés : <strong>%s</strong>%s',
      to_char(v_jour,'DD/MM/YYYY'),
      replace(replace(replace(coalesce(v_vm.full_name,'VM'), '&','&amp;'),'<','&lt;'),'>','&gt;'),
      v_prevu, v_realise, v_non_realise,
      CASE WHEN v_non_realise > 0
        THEN '<br><br>Clients non rencontrés :<br>' || coalesce(v_liste_non_realisees, 'Liste indisponible')
        ELSE '<br><br>Toutes les visites prévues ont été réalisées.'
      END
    );

    -- Le VM reçoit son rapport personnel.
    INSERT INTO public.notifications(profile_id, type, titre, corps, metadata)
    VALUES (
      v_vm.id, 'RAPPORT_VISITES_NON_EFFECTUEES',
      format('Récapitulatif quotidien — %s', to_char(v_jour,'DD/MM/YYYY')),
      v_corps,
      jsonb_build_object('jour',v_jour,'vm_id',v_vm.id,'vm_nom',v_vm.full_name,
        'visites_prevues',v_prevu,'clients_rencontres',v_realise,
        'clients_non_rencontres',v_non_realise,'clients_non_rencontres_liste',coalesce(v_liste_non_realisees,''))
    );
    v_notifications := v_notifications + 1;

    -- Tous les administrateurs actifs reçoivent une copie de ce VM.
    FOR v_recipient IN
      SELECT p.id, p.full_name
      FROM public.profiles p
      WHERE p.role = 'admin' AND p.actif = true AND p.email IS NOT NULL AND btrim(p.email) <> ''
    LOOP
      INSERT INTO public.notifications(profile_id, type, titre, corps, metadata)
      VALUES (
        v_recipient.id, 'RAPPORT_VISITES_NON_EFFECTUEES_VM',
        format('%s — récapitulatif du %s', coalesce(v_vm.full_name,'VM'), to_char(v_jour,'DD/MM/YYYY')),
        v_corps,
        jsonb_build_object('jour',v_jour,'vm_id',v_vm.id,'vm_nom',v_vm.full_name,
          'visites_prevues',v_prevu,'clients_rencontres',v_realise,
          'clients_non_rencontres',v_non_realise,'clients_non_rencontres_liste',coalesce(v_liste_non_realisees,''))
      );
      v_notifications := v_notifications + 1;
    END LOOP;

    -- Les superviseurs rattachés à l'équipe de ce VM reçoivent également le rapport.
    IF v_vm.equipe_id IS NOT NULL THEN
      FOR v_recipient IN
        SELECT DISTINCT p.id, p.full_name
        FROM public.superviseur_equipes se
        JOIN public.profiles p ON p.id = se.superviseur_id
        WHERE se.equipe_id = v_vm.equipe_id
          AND p.role = 'superviseur' AND p.actif = true
          AND p.email IS NOT NULL AND btrim(p.email) <> ''
      LOOP
        INSERT INTO public.notifications(profile_id, type, titre, corps, metadata)
        VALUES (
          v_recipient.id, 'RAPPORT_VISITES_NON_EFFECTUEES_VM',
          format('%s — récapitulatif du %s', coalesce(v_vm.full_name,'VM'), to_char(v_jour,'DD/MM/YYYY')),
          v_corps,
          jsonb_build_object('jour',v_jour,'vm_id',v_vm.id,'vm_nom',v_vm.full_name,
            'visites_prevues',v_prevu,'clients_rencontres',v_realise,
            'clients_non_rencontres',v_non_realise,'clients_non_rencontres_liste',coalesce(v_liste_non_realisees,''))
        );
        v_notifications := v_notifications + 1;
      END LOOP;
    END IF;

    v_envoyes := v_envoyes + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status','ok','jour',v_jour,'rapports_vm',v_envoyes,
    'notifications_creees',v_notifications,
    'heure_benin','20:00'
  );
END;
$function$

;
