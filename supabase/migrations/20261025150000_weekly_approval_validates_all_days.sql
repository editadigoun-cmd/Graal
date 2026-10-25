-- A weekly admin approval also marks every weekday as validated and locked.
-- Existing per-day quota checks are preserved for days that contain visits.
CREATE OR REPLACE FUNCTION public.valider_programme_hebdomadaire(p_programme_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jour public.jour_semaine;
BEGIN
  IF NOT (public.is_admin() OR public.is_superviseur()) THEN
    RAISE EXCEPTION 'Action réservée aux superviseurs et administrateurs';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.programmes_hebdomadaires
    WHERE id = p_programme_id AND statut = 'SOUMIS'
  ) THEN
    RAISE EXCEPTION 'Programme introuvable ou non soumis';
  END IF;

  FOREACH v_jour IN ARRAY ARRAY[
    'LUNDI'::public.jour_semaine,
    'MARDI'::public.jour_semaine,
    'MERCREDI'::public.jour_semaine,
    'JEUDI'::public.jour_semaine,
    'VENDREDI'::public.jour_semaine
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.programme_lignes
      WHERE programme_id = p_programme_id AND jour = v_jour
    ) THEN
      PERFORM public.verifier_quotas_potentiel_jour(p_programme_id, v_jour);
    END IF;
  END LOOP;

  PERFORM set_config('graal.internal_rpc', 'on', true);

  FOREACH v_jour IN ARRAY ARRAY[
    'LUNDI'::public.jour_semaine,
    'MARDI'::public.jour_semaine,
    'MERCREDI'::public.jour_semaine,
    'JEUDI'::public.jour_semaine,
    'VENDREDI'::public.jour_semaine
  ]
  LOOP
    INSERT INTO public.programme_jours_validation
      (programme_id, jour, statut, valide_at, valide_par, updated_at)
    VALUES (p_programme_id, v_jour, 'VALIDE', now(), auth.uid(), now())
    ON CONFLICT (programme_id, jour) DO UPDATE
      SET statut = 'VALIDE',
          valide_at = coalesce(public.programme_jours_validation.valide_at, now()),
          valide_par = coalesce(public.programme_jours_validation.valide_par, auth.uid()),
          updated_at = now();
  END LOOP;

  UPDATE public.programmes_hebdomadaires
  SET statut = 'VALIDE',
      valide_at = now(),
      valide_par = auth.uid()
  WHERE id = p_programme_id AND statut = 'SOUMIS';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programme introuvable ou non soumis';
  END IF;
END;
$function$;
