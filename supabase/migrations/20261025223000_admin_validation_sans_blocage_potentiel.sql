-- Ensure admin day/week approval is not blocked by potential or sector quota rules.
-- VM submission checks remain in place; admin validation is an explicit override.

CREATE OR REPLACE FUNCTION public.valider_jour_programme(
  p_programme_id uuid,
  p_jour public.jour_semaine,
  p_date_limite timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_valides integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Action réservée à un administrateur.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.programmes_hebdomadaires WHERE id = p_programme_id) THEN
    RAISE EXCEPTION 'Programme introuvable.';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.programme_lignes
  WHERE programme_id = p_programme_id AND jour = p_jour;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Impossible de valider un jour sans visite programmée.';
  END IF;

  -- Admin day validation must not be blocked by potential quota rules.
  INSERT INTO public.programme_jours_validation
    (programme_id, jour, statut, valide_at, valide_par, date_limite, updated_at)
  VALUES (p_programme_id, p_jour, 'VALIDE', now(), auth.uid(), p_date_limite, now())
  ON CONFLICT (programme_id, jour) DO UPDATE
    SET statut = 'VALIDE',
        valide_at = now(),
        valide_par = auth.uid(),
        date_limite = coalesce(p_date_limite, public.programme_jours_validation.date_limite),
        updated_at = now();

  SELECT count(*) INTO v_valides
  FROM public.programme_jours_validation
  WHERE programme_id = p_programme_id
    AND statut = 'VALIDE'
    AND jour IN ('LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI');

  IF v_valides = 5 THEN
    PERFORM set_config('graal.internal_rpc', 'on', true);
    UPDATE public.programmes_hebdomadaires
    SET statut = 'VALIDE',
        valide_at = coalesce(valide_at, now()),
        valide_par = coalesce(valide_par, auth.uid()),
        soumis_at = coalesce(soumis_at, now())
    WHERE id = p_programme_id AND statut NOT IN ('VALIDE', 'VERROUILLE');
  END IF;

  RETURN jsonb_build_object(
    'statut', 'VALIDE',
    'programme_id', p_programme_id,
    'jour', p_jour,
    'jours_valides', v_valides,
    'programme_valide', v_valides = 5
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_secteur_soumission_programme()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Admin approval is an explicit override for sector mismatches.
  IF NEW.statut IS DISTINCT FROM OLD.statut
     AND NEW.statut = 'VALIDE'::public.statut_programme
     AND public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Keep the sector check at submission and for non-admin status changes.
  IF NEW.statut IS DISTINCT FROM OLD.statut
     AND NEW.statut IN ('SOUMIS'::public.statut_programme, 'VALIDE'::public.statut_programme) THEN
    IF NEW.secteur IS NULL THEN
      RAISE EXCEPTION 'Impossible de soumettre un programme sans secteur défini.';
    END IF;

    IF NEW.vm_id <> '2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f'::uuid
       AND NOT public.is_fawaz_vm(NEW.vm_id)
       AND NEW.vm_id <> '96388406-e88e-4146-a372-1df07481c8e4'::uuid
       AND EXISTS (
        SELECT 1 FROM public.programme_lignes pl
        JOIN public.clients c ON c.id = pl.client_id
        WHERE pl.programme_id = NEW.id
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
$function$;
