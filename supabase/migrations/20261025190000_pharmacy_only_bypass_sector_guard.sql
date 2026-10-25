-- En mode pharmacie uniquement, le garde-fou de secteur ne doit pas bloquer
-- les pharmacies du portefeuille. Les règles de portefeuille et le contrôle
-- du type de visite restent assurés par les autres validations.
DO $migration$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.guard_secteur_ligne_programme()'::regprocedure);
  v_def := replace(v_def,
    '  v_vm_id uuid;',
    '  v_vm_id uuid;' || E'\n  v_mode_pharmacie boolean;');
  v_def := replace(v_def,
    'SELECT secteur, semaine_debut, vm_id INTO v_secteur_programme, v_semaine, v_vm_id',
    'SELECT secteur, semaine_debut, vm_id, mode_pharmacie_uniquement INTO v_secteur_programme, v_semaine, v_vm_id, v_mode_pharmacie');
  v_def := replace(v_def,
    '  IF EXISTS (SELECT 1 FROM public.programme_jours_validation',
    '  IF coalesce(v_mode_pharmacie, false) THEN RETURN NEW; END IF;' || E'\n  IF EXISTS (SELECT 1 FROM public.programme_jours_validation');
  IF v_def NOT LIKE '%v_mode_pharmacie%' OR v_def NOT LIKE '%mode_pharmacie_uniquement INTO v_secteur_programme%' THEN
    RAISE EXCEPTION 'Impossible de mettre à jour la règle de secteur du mode pharmacie uniquement';
  END IF;
  EXECUTE v_def;
END
$migration$;