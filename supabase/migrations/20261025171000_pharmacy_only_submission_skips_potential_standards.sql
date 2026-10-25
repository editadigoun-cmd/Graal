DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.soumettre_programme_hebdomadaire(uuid)'::regprocedure);
  v_old := 'if not public.is_fawaz_vm(prog.vm_id) then';
  v_new := 'if not prog.mode_pharmacie_uniquement and not public.is_fawaz_vm(prog.vm_id) then';
  v_def := replace(v_def, v_old, v_new);
  IF v_def NOT LIKE '%if not prog.mode_pharmacie_uniquement and not public.is_fawaz_vm(prog.vm_id) then%' THEN
    RAISE EXCEPTION 'Impossible d''adapter les standards de soumission au mode pharmacie uniquement';
  END IF;
  EXECUTE v_def;
END
$migration$;