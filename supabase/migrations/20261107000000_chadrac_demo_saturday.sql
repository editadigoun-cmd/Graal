-- Dérogation ponctuelle : samedi 07/11/2026 pour le compte de démonstration Chadrac.
-- Le trigger limite cette journée à son programme de la semaine du 02/11/2026.
ALTER TYPE public.jour_semaine ADD VALUE IF NOT EXISTS 'SAMEDI';

CREATE OR REPLACE FUNCTION public.guard_demo_samedi_chadrac()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_vm_id uuid;
  v_semaine date;
BEGIN
  IF NEW.jour::text <> 'SAMEDI' THEN
    RETURN NEW;
  END IF;

  SELECT vm_id, semaine_debut
    INTO v_vm_id, v_semaine
  FROM public.programmes_hebdomadaires
  WHERE id = NEW.programme_id;

  IF v_vm_id IS DISTINCT FROM 'd0be68dd-eba0-4b9e-8215-df216d6a7963'::uuid
     OR v_semaine IS DISTINCT FROM DATE '2026-11-02' THEN
    RAISE EXCEPTION 'Le samedi est autorisé uniquement pour la démonstration de Chadrac du 07/11/2026.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_demo_samedi_chadrac_guard ON public.programme_lignes;
CREATE TRIGGER a_demo_samedi_chadrac_guard
BEFORE INSERT OR UPDATE OF programme_id, jour
ON public.programme_lignes
FOR EACH ROW
EXECUTE FUNCTION public.guard_demo_samedi_chadrac();
