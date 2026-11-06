-- Dérogation de garde strictement limitée à Chadrac le samedi 07/11/2026.
CREATE OR REPLACE FUNCTION public.verifier_jour_garde_equipe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipe text;
  v_jour_iso integer;
BEGIN
  IF new.vm_id = 'd0be68dd-eba0-4b9e-8215-df216d6a7963'::uuid
     AND new.jour = DATE '2026-11-07' THEN
    RETURN NEW;
  END IF;

  SELECT upper(trim(e.nom)) INTO v_equipe
  FROM public.profiles p
  LEFT JOIN public.equipes e ON e.id = p.equipe_id
  WHERE p.id = new.vm_id;

  v_jour_iso := extract(isodow from new.jour)::integer;
  IF v_equipe = 'PROPHADIS' AND v_jour_iso NOT IN (1, 3) THEN
    RAISE EXCEPTION 'Les gardes PROPHADIS sont planifiées le lundi et le mercredi.';
  ELSIF v_equipe = 'ODYPAHARM' AND v_jour_iso NOT IN (2, 4) THEN
    RAISE EXCEPTION 'Les gardes ODYPAHARM sont planifiées le mardi et le jeudi.';
  ELSIF v_equipe IN ('TIL', 'TIL HEALTH CARE') AND v_jour_iso NOT IN (2, 3, 4) THEN
    RAISE EXCEPTION 'Les gardes TIL sont planifiées le mardi, le mercredi et le jeudi.';
  ELSIF coalesce(v_equipe, '') NOT IN ('PROPHADIS', 'ODYPAHARM', 'TIL', 'TIL HEALTH CARE') THEN
    RAISE EXCEPTION 'Aucun calendrier de garde configuré pour cette équipe.';
  END IF;
  RETURN NEW;
END;
$function$;
