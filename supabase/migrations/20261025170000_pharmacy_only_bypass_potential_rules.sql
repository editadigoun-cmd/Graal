DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure);

  -- La base active peut déjà contenir ces règles : dans ce cas, ne rien réécrire.
  IF v_def LIKE '%not prog.mode_pharmacie_uniquement and not public.is_fawaz_vm%'
     AND v_def LIKE '%and not prog.mode_pharmacie_uniquement%' THEN
    RETURN;
  END IF;

  v_old := 'if not public.is_fawaz_vm(prog.vm_id) and prog.vm_id <> ''2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f''::uuid then';
  v_new := 'if not prog.mode_pharmacie_uniquement and not public.is_fawaz_vm(prog.vm_id) and prog.vm_id <> ''2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f''::uuid then';
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Source inattendue dans trg_programme_lignes_validate : garde de potentiel introuvable';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := 'where programme_id = new.programme_id and client_id = new.client_id
      and id is distinct from new.id
  ) then';
  v_new := 'where programme_id = new.programme_id and client_id = new.client_id
      and id is distinct from new.id
      and not prog.mode_pharmacie_uniquement
  ) then';
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Source inattendue dans trg_programme_lignes_validate : garde de doublon introuvable';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  IF v_def NOT LIKE '%not prog.mode_pharmacie_uniquement and not public.is_fawaz_vm%'
     OR v_def NOT LIKE '%and not prog.mode_pharmacie_uniquement%' THEN
    RAISE EXCEPTION 'Vérification finale échouée pour les règles pharmacie uniquement';
  END IF;
  EXECUTE v_def;
END
$migration$;
