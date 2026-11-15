DO $$
DECLARE
  v_definition text;
  v_old_rule text := $rule$
    IF new.type_visite = 'MEDICAL' AND cl.specialite NOT IN ('MATERNITE'::public.specialite_client, 'DISPENSAIRE'::public.specialite_client) THEN
      RAISE EXCEPTION 'ODYPHARM2 peut ajouter uniquement les centres de santé de son portefeuille en visite complémentaire.';
    END IF;
$rule$;
BEGIN
  SELECT pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure)
    INTO v_definition;

  IF position(v_old_rule in v_definition) = 0 THEN
    RAISE EXCEPTION 'Règle ODYPHARM2 attendue introuvable : migration annulée sans modification.';
  END IF;

  v_definition := replace(v_definition, v_old_rule, '');
  EXECUTE v_definition;
END
$$;
