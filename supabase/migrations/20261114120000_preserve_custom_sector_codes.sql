-- Preserve custom geographic sectors (MONO/COUFFOU) during the legacy weekly A/B rotation.
CREATE OR REPLACE FUNCTION public.alterner_secteurs_vm_hebdomadaire()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM set_config('graal.internal_rpc', 'on', true);
  UPDATE public.profiles
  SET secteur = CASE secteur
        WHEN 'A' THEN 'B'::public.secteur_code
        WHEN 'B' THEN 'A'::public.secteur_code
        ELSE secteur
      END,
      updated_at = now()
  WHERE role = 'vm' AND actif = true AND secteur IS NOT NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.alterner_secteurs_vm_hebdomadaire() FROM PUBLIC, anon, authenticated;
