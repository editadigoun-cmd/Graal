-- Remove the fixed medium-potential cap on Thursday and Friday.
-- GROS and FAIBLE caps remain enforced; Friday FAIBLE must not exceed MOYEN.
do $$
declare
  v text;
begin
  select pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure) into v;
  v := replace(v, 'max_moyen_jour := 7;', 'max_moyen_jour := 2147483647;');
  v := replace(v, 'maximum 5 GROS, 7 MOYENS et 3 FAIBLES', 'maximum 5 GROS et 3 FAIBLES; le nombre de MOYENS est libre');
  v := replace(v, 'maximum 3 GROS, 7 MOYENS et 5 FAIBLES', 'maximum 3 GROS et 5 FAIBLES; le nombre de MOYENS est libre');
  execute v;

  select pg_get_functiondef('public.soumettre_programme_hebdomadaire(uuid)'::regprocedure) into v;
  v := replace(v, 'if nb_jeudi_gros > 5 or nb_jeudi_moyen > 7 or nb_jeudi_faible > 3 then',
                  'if nb_jeudi_gros > 5 or nb_jeudi_faible > 3 then');
  v := replace(v, 'Standards du jeudi dépassés : maximum 5 GROS, 7 MOYENS et 3 FAIBLES.',
                  'Standards du jeudi dépassés : maximum 5 GROS et 3 FAIBLES; le nombre de MOYENS est libre.');
  v := replace(v, 'if nb_vendredi_gros > 3 or nb_vendredi_moyen > 7 or nb_vendredi_faible > 5 then',
                  'if nb_vendredi_gros > 3 or nb_vendredi_faible > 5 then');
  v := replace(v, 'Standards du vendredi dépassés : maximum 3 GROS, 7 MOYENS et 5 FAIBLES.',
                  'Standards du vendredi dépassés : maximum 3 GROS et 5 FAIBLES; le nombre de MOYENS est libre.');
  execute v;
end $$;