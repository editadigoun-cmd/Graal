-- Autoriser une pharmacie de potentiel FAIBLE indépendamment des quotas médicaux FAIBLES.
-- La règle concerne l'ajout d'une pharmacie faible : elle ne doit pas être bloquée
-- par les plafonds de FAIBLES, l'équilibre du vendredi ni la hiérarchisation journalière.
DO $migration$
DECLARE
  fn text;
BEGIN
  SELECT pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure) INTO fn;

  IF position('if cl.potentiel = ''FAIBLE'' and nb_faible_jour >= max_faible_jour then' in fn) = 0
     OR position('if new.jour = ''VENDREDI'' and not public.is_fawaz_vm(prog.vm_id) then' in fn) = 0
     OR position('elsif not public.potentiel_autorise(new.jour, cl.potentiel) then' in fn) = 0 THEN
    RAISE EXCEPTION 'La fonction de validation a changé : migration arrêtée sans modification';
  END IF;

  fn := replace(
    fn,
    'if cl.potentiel = ''FAIBLE'' and nb_faible_jour >= max_faible_jour then',
    'if not (new.type_visite = ''PHARMACIE'' and cl.potentiel = ''FAIBLE'') and cl.potentiel = ''FAIBLE'' and nb_faible_jour >= max_faible_jour then'
  );
  fn := replace(
    fn,
    'if new.jour = ''VENDREDI'' and not public.is_fawaz_vm(prog.vm_id) then',
    'if new.jour = ''VENDREDI'' and not public.is_fawaz_vm(prog.vm_id) and not (new.type_visite = ''PHARMACIE'' and cl.potentiel = ''FAIBLE'') then'
  );
  fn := replace(
    fn,
    'elsif not public.potentiel_autorise(new.jour, cl.potentiel) then',
    'elsif not (new.type_visite = ''PHARMACIE'' and cl.potentiel = ''FAIBLE'') and not public.potentiel_autorise(new.jour, cl.potentiel) then'
  );

  EXECUTE fn;
END
$migration$;
