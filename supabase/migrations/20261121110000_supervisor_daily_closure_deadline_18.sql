-- Supervisors have a daily closure deadline of 18:00 Benin time.
-- VM deadline remains controlled by the existing global parameter.
do $$
declare
  v_definition text;
  v_old text := 'v_heure_limite := public.parametre_text(''heure_cloture_journee'', ''19:00'')::time;';
  v_new text := 'if exists (select 1 from public.profiles where id = v_vm and role = ''superviseur'') then
    v_heure_limite := time ''18:00'';
  else
    v_heure_limite := public.parametre_text(''heure_cloture_journee'', ''19:00'')::time;
  end if;';
begin
  v_definition := pg_get_functiondef('public.cloturer_journee(text,double precision,double precision,jsonb)'::regprocedure);
  if position(v_old in v_definition) = 0 then
    raise exception 'Expected closure deadline expression not found; migration stopped.';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end $$;