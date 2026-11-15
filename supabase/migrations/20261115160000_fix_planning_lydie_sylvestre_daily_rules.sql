-- Aligner les règles de programmation de Lydie et Sylvestre entre le client et la base.
-- Les deux VM ont des quotas journaliers spécifiques ; les seuils génériques 15/3
-- ne doivent ni s'afficher ni bloquer leur soumission.

DO $$
DECLARE
  v text;
  old_block text;
  new_block text;
BEGIN
  v := pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure);
  old_block := 'ELSIF NOT v_odypharm2 AND NOT derog_potentiel AND NOT public.is_fawaz_vm(prog.vm_id) THEN';
  new_block := 'ELSIF NOT v_odypharm2 AND NOT derog_potentiel AND NOT public.is_fawaz_vm(prog.vm_id) AND prog.vm_id NOT IN (''62cdc900-5544-470a-94bf-ef30c9c8fb2f''::uuid, ''db3b946a-165e-4a20-91e0-073c2e170a72''::uuid) THEN';
  IF position(old_block in v) = 0 THEN
    RAISE EXCEPTION 'Bloc de règles génériques introuvable dans trg_programme_lignes_validate';
  END IF;
  EXECUTE replace(v, old_block, new_block);

  v := pg_get_functiondef('public.soumettre_jour_programme(uuid,jour_semaine)'::regprocedure);
  old_block := '  IF p_jour IN (''LUNDI'',''MARDI'',''MERCREDI'',''JEUDI'',''VENDREDI'')' || chr(10) ||
    '     AND NOT v_programme.mode_pharmacie_uniquement AND NOT v_odypharm2' || chr(10) ||
    '     AND v_programme.vm_id NOT IN (''e86efe52-ed01-4d04-8eec-e539fd1e4b30''::uuid, ''bb2519e6-04d8-4740-b878-a0b999ad7606''::uuid) THEN';
  new_block := '  IF p_jour IN (''LUNDI'',''MARDI'',''MERCREDI'',''JEUDI'',''VENDREDI'')' || chr(10) ||
    '     AND NOT v_programme.mode_pharmacie_uniquement AND NOT v_odypharm2' || chr(10) ||
    '     AND v_programme.vm_id NOT IN (''e86efe52-ed01-4d04-8eec-e539fd1e4b30''::uuid, ''bb2519e6-04d8-4740-b878-a0b999ad7606''::uuid, ''62cdc900-5544-470a-94bf-ef30c9c8fb2f''::uuid, ''db3b946a-165e-4a20-91e0-073c2e170a72''::uuid) THEN';
  IF position(old_block in v) = 0 THEN
    RAISE EXCEPTION 'Bloc de minima génériques introuvable dans soumettre_jour_programme';
  END IF;
  v := replace(v, old_block, new_block);

  old_block := '  IF v_odypharm2 AND p_jour IN (''LUNDI'',''MARDI'',''MERCREDI'',''JEUDI'',''VENDREDI'') THEN';
  new_block := '  IF v_programme.vm_id IN (''62cdc900-5544-470a-94bf-ef30c9c8fb2f''::uuid, ''db3b946a-165e-4a20-91e0-073c2e170a72''::uuid)' || chr(10) ||
    '     AND NOT v_programme.mode_pharmacie_uniquement AND p_jour IN (''LUNDI'',''MARDI'',''MERCREDI'',''JEUDI'',''VENDREDI'') THEN' || chr(10) ||
    '    DECLARE n_gros integer; n_moyen integer; n_faible integer;' || chr(10) ||
    '    BEGIN' || chr(10) ||
    '      SELECT count(*) FILTER (WHERE pl.type_visite=''MEDICAL'' AND c.potentiel=''GROS''),' || chr(10) ||
    '             count(*) FILTER (WHERE pl.type_visite=''MEDICAL'' AND c.potentiel=''MOYEN''),' || chr(10) ||
    '             count(*) FILTER (WHERE pl.type_visite=''MEDICAL'' AND c.potentiel=''FAIBLE'')' || chr(10) ||
    '        INTO n_gros,n_moyen,n_faible' || chr(10) ||
    '      FROM public.programme_lignes pl JOIN public.clients c ON c.id=pl.client_id' || chr(10) ||
    '      WHERE pl.programme_id=p_programme_id AND pl.jour=p_jour;' || chr(10) ||
    '      IF p_jour IN (''LUNDI'',''MARDI'',''MERCREDI'') THEN' || chr(10) ||
    '        IF n_gros < 7 OR n_moyen > 7 OR n_faible > 2 OR v_pharmacie < 2 THEN' || chr(10) ||
    '          RAISE EXCEPTION ''Quota Lydie/Sylvestre non respecté : GROS %, MOYEN %, FAIBLE %, pharmacies %. Attendu : GROS minimum 7, MOYEN maximum 7, FAIBLE maximum 2, pharmacies minimum 2.'',n_gros,n_moyen,n_faible,v_pharmacie;' || chr(10) ||
    '        END IF;' || chr(10) ||
    '      ELSE' || chr(10) ||
    '        IF v_medical < 16 OR n_gros < 2 OR v_pharmacie < 2 THEN' || chr(10) ||
    '          RAISE EXCEPTION ''Quota Lydie/Sylvestre non respecté : médical %, GROS %, pharmacies %. Attendu : médical minimum 16, GROS minimum 2, pharmacies minimum 2.'',v_medical,n_gros,v_pharmacie;' || chr(10) ||
    '        END IF;' || chr(10) ||
    '      END IF;' || chr(10) ||
    '    END;' || chr(10) ||
    '  ELSIF v_odypharm2 AND p_jour IN (''LUNDI'',''MARDI'',''MERCREDI'',''JEUDI'',''VENDREDI'') THEN';
  IF position(old_block in v) = 0 THEN
    RAISE EXCEPTION 'Bloc ODYPHARM2 introuvable dans soumettre_jour_programme';
  END IF;
  EXECUTE replace(v, old_block, new_block);
END $$;
