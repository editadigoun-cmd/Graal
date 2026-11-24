create or replace function public.guard_plan_activite_deadline()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- L'échéance bloque les nouvelles soumissions, mais un superviseur doit pouvoir
  -- corriger un plan explicitement retourné par l'administrateur.
  if now() > public.graal_deadline_mensuelle(new.mois)
     and not public.is_admin()
     and not (tg_op = 'UPDATE' and old.statut = 'REFUSE') then
    raise exception 'Le plan d''action est fermé : échéance le 25 à 21h00 (heure du Bénin)';
  end if;
  return new;
end;
$function$;
