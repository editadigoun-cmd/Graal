-- Alternance hebdomadaire des secteurs + contrôle serveur du secteur des visites programmées.
CREATE OR REPLACE FUNCTION public.trg_profiles_guard_role()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF (new.role, new.secteur, new.equipe_id) IS DISTINCT FROM (old.role, old.secteur, old.equipe_id)
     AND NOT public.is_admin()
     AND coalesce(current_setting('graal.internal_rpc', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'Seul un administrateur peut modifier le rôle, le secteur ou l''équipe d''un utilisateur';
  END IF;
  RETURN new;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.alterner_secteurs_vm_hebdomadaire()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM set_config('graal.internal_rpc', 'on', true);
  UPDATE public.profiles
  SET secteur = CASE secteur WHEN 'A' THEN 'B'::public.secteur_code WHEN 'B' THEN 'A'::public.secteur_code END,
      updated_at = now()
  WHERE role = 'vm' AND actif = true AND secteur IS NOT NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.alterner_secteurs_vm_hebdomadaire() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_secteur_ligne_programme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_secteur_programme public.secteur_code;
  v_secteur_client public.secteur_code;
  v_semaine date;
  v_potentiel public.potentiel_client;
BEGIN
  SELECT secteur, semaine_debut INTO v_secteur_programme, v_semaine
  FROM public.programmes_hebdomadaires WHERE id = new.programme_id;
  SELECT secteur, potentiel INTO v_secteur_client, v_potentiel
  FROM public.clients WHERE id = new.client_id;

  IF public.fusion_active(v_semaine, v_potentiel) THEN RETURN new; END IF;
  IF v_secteur_programme IS NULL THEN
    RAISE EXCEPTION 'Le secteur de ce programme n''est pas défini. Rechargez le planning ou contactez un administrateur.';
  END IF;
  IF v_secteur_client IS DISTINCT FROM v_secteur_programme THEN
    RAISE EXCEPTION 'Secteur interdit : ce programme est réservé au secteur %, mais ce client appartient au secteur %.',
      v_secteur_programme, coalesce(v_secteur_client::text, 'non défini');
  END IF;
  RETURN new;
END;
$fn$;
DROP TRIGGER IF EXISTS programme_lignes_sector_guard ON public.programme_lignes;
CREATE TRIGGER programme_lignes_sector_guard
BEFORE INSERT OR UPDATE OF programme_id, client_id ON public.programme_lignes
FOR EACH ROW EXECUTE FUNCTION public.guard_secteur_ligne_programme();

CREATE OR REPLACE FUNCTION public.guard_secteur_soumission_programme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.statut IS DISTINCT FROM OLD.statut AND NEW.statut IN ('SOUMIS'::public.statut_programme, 'VALIDE'::public.statut_programme) THEN
    IF NEW.secteur IS NULL THEN RAISE EXCEPTION 'Impossible de soumettre un programme sans secteur défini.'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.programme_lignes pl JOIN public.clients c ON c.id = pl.client_id
      WHERE pl.programme_id = NEW.id
        AND NOT public.fusion_active(NEW.semaine_debut, c.potentiel)
        AND c.secteur IS DISTINCT FROM NEW.secteur
    ) THEN
      RAISE EXCEPTION 'Programme non conforme : retirez les clients qui ne correspondent pas au secteur % avant la soumission.', NEW.secteur;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS programmes_sector_submission_guard ON public.programmes_hebdomadaires;
CREATE TRIGGER programmes_sector_submission_guard
BEFORE UPDATE OF statut ON public.programmes_hebdomadaires
FOR EACH ROW EXECUTE FUNCTION public.guard_secteur_soumission_programme();

DO $block$
DECLARE v_job_id bigint;
BEGIN
  FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname = 'graal-alternance-secteurs'
  LOOP PERFORM cron.unschedule(v_job_id); END LOOP;
  PERFORM cron.schedule(
    'graal-alternance-secteurs',
    '0 23 * * 0',
    $job$SELECT public.alterner_secteurs_vm_hebdomadaire();$job$
  );
END;
$block$;
