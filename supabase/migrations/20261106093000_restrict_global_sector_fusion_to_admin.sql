-- Sector fusion is a global weekly setting; only administrators may change it.
create or replace function public.definir_fusion_secteurs(p_semaine_debut date, p_potentiels public.potentiel_client[], p_actif boolean)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs';
  end if;

  if extract(isodow from p_semaine_debut) <> 1 then
    raise exception 'La semaine doit commencer un lundi';
  end if;

  insert into public.fusions_secteurs (semaine_debut, potentiels, cree_par, actif)
  values (p_semaine_debut, p_potentiels, auth.uid(), p_actif)
  returning id into v_id;

  return v_id;
end;
$function$;