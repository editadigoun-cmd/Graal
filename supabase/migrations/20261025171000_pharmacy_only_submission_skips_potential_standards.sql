DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.soumettre_programme_hebdomadaire(uuid)'::regprocedure);
  v_new := 'if not prog.mode_pharmacie_uniquement and not public.is_fawaz_vm(prog.vm_id) then';

  -- La règle est déjà présente dans la base active : aucun remplacement à refaire.
  IF position(v_new in v_def) > 0 THEN
    RETURN;
  END IF;

  v_old := 'if not public.is_fawaz_vm(prog.vm_id) then';
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Source inattendue dans soumettre_programme_hebdomadaire : garde de standards introuvable';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  IF position(v_new in v_def) = 0 THEN
    RAISE EXCEPTION 'Vérification finale échouée pour les standards pharmacie uniquement';
  END IF;
  EXECUTE v_def;
END
$migration$;
