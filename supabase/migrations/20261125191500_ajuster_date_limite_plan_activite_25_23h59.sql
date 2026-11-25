create or replace function public.guard_plan_activite_deadline()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_deadline timestamptz;
begin
  -- Le plan du mois suivant doit être soumis le 25 du mois courant avant 23h59.
  -- graal_deadline_mensuelle() reste inchangée pour conserver l'échéance VAD à 21h.
  v_deadline := (
    (date_trunc('month', new.mois)::date - interval '1 month')::date
    + 24
    + time '23:59:59'
  ) at time zone 'Africa/Porto-Novo';

  if now() > v_deadline
     and not public.is_admin()
     and not (tg_op = 'UPDATE' and old.statut = 'REFUSE') then
    raise exception 'Le plan d''activité est fermé : échéance le 25 à 23h59 (heure du Bénin)';
  end if;
  return new;
end;
$function$;
