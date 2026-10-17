-- Keep the RPC fallback consistent with the configured Saturday 14:00 deadline.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.soumettre_programme_hebdomadaire(uuid)'::regprocedure)
    into v_definition;
  v_definition := replace(v_definition, '''12:00''', '''14:00''');
  execute v_definition;
end;
$$;
