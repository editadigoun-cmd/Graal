-- Scope helper RPCs that reveal planning exceptions and Fawaz-specific status.
create or replace function public.derogation_planning_active(p_vm_id uuid, p_semaine_debut date, p_type text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not (public.is_admin() or public.is_vm_in_my_scope(p_vm_id)) then
    return false;
  end if;

  return exists (
    select 1
    from public.derogations_planning d
    left join public.profiles vm on vm.id = p_vm_id
    where d.actif
      and d.semaine_debut = p_semaine_debut
      and (d.vm_id = p_vm_id or (d.equipe_id is not null and vm.equipe_id = d.equipe_id))
      and case upper(p_type)
        when 'ZONE' then d.lever_zone
        when 'POTENTIEL' then d.lever_potentiel
        when 'SPECIALITE:GENERALISTE' then d.specialite_autorisee = 'GENERALISTE'::public.specialite_client
        else false
      end
  );
end;
$function$;

create or replace function public.is_fawaz_vm(p_vm_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    (auth.uid() is not null)
    and (public.is_admin() or public.is_vm_in_my_scope(p_vm_id))
    and exists (
      select 1 from public.profiles p
      where p.id = p_vm_id
        and lower(coalesce(p.email,'')) = 'fawazakindele12@gmail.com'
    );
$function$;