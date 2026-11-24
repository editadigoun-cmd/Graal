CREATE TABLE IF NOT EXISTS public.vm_secteurs (
  vm_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  secteur public.secteur_code NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vm_id, secteur)
);

ALTER TABLE public.vm_secteurs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vm_secteurs TO authenticated;

DROP POLICY IF EXISTS "VM lit ses secteurs et admin tous" ON public.vm_secteurs;
CREATE POLICY "VM lit ses secteurs et admin tous"
  ON public.vm_secteurs FOR SELECT TO authenticated
  USING (vm_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Admin gère les secteurs VM" ON public.vm_secteurs;
CREATE POLICY "Admin gère les secteurs VM"
  ON public.vm_secteurs FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.portefeuille_check_secteur()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE
  v_secteur public.secteur_code;
  c_secteur public.secteur_code;
  v_equipe_id uuid;
  c_specialite public.specialite_client;
BEGIN
  SELECT secteur, equipe_id INTO v_secteur, v_equipe_id
  FROM public.profiles WHERE id = NEW.vm_id;
  SELECT secteur, specialite INTO c_secteur, c_specialite
  FROM public.clients WHERE id = NEW.client_id;

  IF EXISTS (
    SELECT 1 FROM public.vm_secteurs vs
    WHERE vs.vm_id = NEW.vm_id AND vs.secteur = c_secteur
  ) THEN
    RETURN NEW;
  END IF;

  IF v_secteur IS DISTINCT FROM c_secteur
     AND NOT (v_equipe_id = 'f2e94e91-40ee-4be5-b72b-0cee7cc1fd9c'::uuid
              AND c_specialite = 'PHARMACIE'::public.specialite_client) THEN
    RAISE EXCEPTION 'Le client (secteur %) ne peut pas être affecté à un VM du secteur %', c_secteur, v_secteur
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_secteur_ligne_programme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_secteur_programme public.secteur_code;
  v_secteur_client public.secteur_code;
  v_semaine date;
  v_vm_id uuid;
  v_equipe_id uuid;
  v_mode_pharmacie boolean;
  v_specialite public.specialite_client;
BEGIN
  SELECT secteur, semaine_debut, vm_id, mode_pharmacie_uniquement
    INTO v_secteur_programme, v_semaine, v_vm_id, v_mode_pharmacie
  FROM public.programmes_hebdomadaires WHERE id = NEW.programme_id;

  IF v_vm_id = 'db3b946a-165e-4a20-91e0-073c2e170a72'::uuid THEN RETURN NEW; END IF;

  SELECT equipe_id INTO v_equipe_id FROM public.profiles WHERE id = v_vm_id;
  SELECT secteur, specialite INTO v_secteur_client, v_specialite
  FROM public.clients WHERE id = NEW.client_id;

  IF v_equipe_id = 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid THEN RETURN NEW; END IF;
  IF COALESCE(v_mode_pharmacie, false) THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.programme_jours_validation pjv
    WHERE pjv.programme_id = NEW.programme_id AND pjv.jour = NEW.jour AND pjv.statut = 'VALIDE'
  ) THEN RETURN NEW; END IF;
  IF v_vm_id = '2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f'::uuid
     OR public.is_fawaz_vm(v_vm_id) OR v_vm_id = '96388406-e88e-4146-a372-1df07481c8e4'::uuid THEN RETURN NEW; END IF;
  IF public.fusion_active(v_semaine, (SELECT potentiel FROM public.clients WHERE id = NEW.client_id)) THEN RETURN NEW; END IF;
  IF public.derogation_planning_active(v_vm_id, v_semaine, 'SPECIALITE:GENERALISTE')
     AND v_specialite = 'GENERALISTE'::public.specialite_client THEN RETURN NEW; END IF;

  IF v_secteur_programme IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.vm_secteurs vs
      WHERE vs.vm_id = v_vm_id AND vs.secteur = v_secteur_client
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Le secteur de ce programme n''est pas défini. Rechargez le planning ou contactez un administrateur.';
  END IF;

  IF v_secteur_client IS DISTINCT FROM v_secteur_programme THEN
    RAISE EXCEPTION 'Secteur interdit : ce programme est réservé au secteur %, mais ce client appartient au secteur %.',
      v_secteur_programme, COALESCE(v_secteur_client::text, 'non défini');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_secteur_soumission_programme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NEW.statut IS DISTINCT FROM OLD.statut
     AND NEW.statut = 'VALIDE'::public.statut_programme AND public.is_admin() THEN RETURN NEW; END IF;
  IF NEW.vm_id = 'db3b946a-165e-4a20-91e0-073c2e170a72'::uuid THEN RETURN NEW; END IF;

  IF NEW.statut IS DISTINCT FROM OLD.statut
     AND NEW.statut IN ('SOUMIS'::public.statut_programme, 'VALIDE'::public.statut_programme) THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = NEW.vm_id AND p.equipe_id = 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid
    ) THEN RETURN NEW; END IF;

    IF NEW.secteur IS NULL
       AND NOT public.derogation_planning_active(NEW.vm_id, NEW.semaine_debut, 'ZONE')
       AND NOT EXISTS (SELECT 1 FROM public.vm_secteurs vs WHERE vs.vm_id = NEW.vm_id) THEN
      RAISE EXCEPTION 'Impossible de soumettre un programme sans secteur défini.';
    END IF;

    IF NEW.vm_id <> '2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f'::uuid
      AND NOT public.is_fawaz_vm(NEW.vm_id)
      AND NEW.vm_id <> '96388406-e88e-4146-a372-1df07481c8e4'::uuid
      AND NOT public.derogation_planning_active(NEW.vm_id, NEW.semaine_debut, 'ZONE')
      AND EXISTS (
        SELECT 1
        FROM public.programme_lignes pl
        JOIN public.clients c ON c.id = pl.client_id
        WHERE pl.programme_id = NEW.id
          AND NOT EXISTS (
            SELECT 1 FROM public.programme_jours_validation pjv
            WHERE pjv.programme_id = pl.programme_id
              AND pjv.jour = pl.jour
              AND pjv.statut = 'VALIDE'
          )
          AND NOT public.fusion_active(NEW.semaine_debut, c.potentiel)
          AND (
            CASE
              WHEN NEW.secteur IS NULL THEN NOT EXISTS (
                SELECT 1 FROM public.vm_secteurs vs
                WHERE vs.vm_id = NEW.vm_id AND vs.secteur = c.secteur
              )
              ELSE c.secteur IS DISTINCT FROM NEW.secteur
            END
          )
          AND NOT (
            c.specialite = 'GENERALISTE'::public.specialite_client
            AND public.derogation_planning_active(NEW.vm_id, NEW.semaine_debut, 'SPECIALITE:GENERALISTE')
          )
      ) THEN
      RAISE EXCEPTION 'Programme non conforme aux secteurs autorisés pour ce VM.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

INSERT INTO public.vm_secteurs (vm_id, secteur)
SELECT p.id, s.secteur::public.secteur_code
FROM public.profiles p
CROSS JOIN (VALUES ('KETOU-POBE'), ('SAKETE')) AS s(secteur)
WHERE lower(trim(p.email)) = 'gnintaarnaud@gmail.com'
ON CONFLICT (vm_id, secteur) DO NOTHING;

UPDATE public.profiles
SET secteur = 'KETOU-POBE'::public.secteur_code, updated_at = now()
WHERE lower(trim(email)) = 'gnintaarnaud@gmail.com';

UPDATE public.programmes_hebdomadaires ph
SET secteur = NULL
FROM public.profiles p
WHERE ph.vm_id = p.id
  AND lower(trim(p.email)) = 'gnintaarnaud@gmail.com'
  AND ph.statut = 'BROUILLON'
  AND ph.semaine_debut >= DATE '2026-11-30';
