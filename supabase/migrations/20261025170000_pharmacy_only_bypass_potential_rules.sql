DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure);
  v_old := 'if not public.is_fawaz_vm(prog.vm_id) and prog.vm_id <> ''2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f''::uuid then';
  v_new := 'if not prog.mode_pharmacie_uniquement and not public.is_fawaz_vm(prog.vm_id) and prog.vm_id <> ''2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f''::uuid then';
  v_def := replace(v_def, v_old, v_new);
  v_old := 'where programme_id = new.programme_id and client_id = new.client_id
      and id is distinct from new.id
  ) then';
  v_new := 'where programme_id = new.programme_id and client_id = new.client_id
      and id is distinct from new.id
      and not prog.mode_pharmacie_uniquement
  ) then';
  v_def := replace(v_def, v_old, v_new);
  IF v_def NOT LIKE '%not prog.mode_pharmacie_uniquement and not public.is_fawaz_vm%' THEN
    RAISE EXCEPTION 'Impossible d''adapter les règles de potentiel du mode pharmacie uniquement';
  END IF;
  IF v_def NOT LIKE '%and not prog.mode_pharmacie_uniquement%' THEN
    RAISE EXCEPTION 'Impossible d''adapter la règle de doublon du mode pharmacie uniquement';
  END IF;
  EXECUTE v_def;
END
$migration$;