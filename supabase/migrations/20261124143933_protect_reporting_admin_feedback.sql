create or replace function public.guard_reporting_admin_feedback()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if not public.is_admin() and (
    new.appreciation_admin is distinct from old.appreciation_admin
    or new.recommandations_admin is distinct from old.recommandations_admin
    or new.visa_admin_id is distinct from old.visa_admin_id
    or new.visa_admin_at is distinct from old.visa_admin_at
  ) then
    raise exception 'Seul un administrateur peut modifier l’avis administratif du reporting';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_reporting_admin_feedback on public.reporting_hebdomadaire;
create trigger guard_reporting_admin_feedback
before update on public.reporting_hebdomadaire
for each row execute function public.guard_reporting_admin_feedback();
