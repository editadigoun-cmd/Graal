-- Restrict supervisor mutations to programmes belonging to their supervised teams.
create or replace function public.definir_mode_pharmacie_uniquement(p_programme_id uuid, p_actif boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_vm_id uuid;
begin
  if not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs';
  end if;

  select vm_id into v_vm_id
  from public.programmes_hebdomadaires
  where id = p_programme_id and statut = 'BROUILLON'
  for update;

  if not found then
    raise exception 'Programme introuvable ou déjà soumis';
  end if;

  if not public.is_admin() and not public.is_vm_in_my_scope(v_vm_id) then
    raise exception 'Programme hors de votre périmètre de supervision';
  end if;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
    set mode_pharmacie_uniquement = p_actif
    where id = p_programme_id and statut = 'BROUILLON';
end;
$function$;

create or replace function public.rejeter_programme_hebdomadaire(p_programme_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_vm_id uuid;
begin
  if not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs';
  end if;

  select vm_id into v_vm_id
  from public.programmes_hebdomadaires
  where id = p_programme_id and statut = 'SOUMIS'
  for update;

  if not found then
    raise exception 'Programme introuvable ou non soumis';
  end if;

  if not public.is_admin() and not public.is_vm_in_my_scope(v_vm_id) then
    raise exception 'Programme hors de votre périmètre de supervision';
  end if;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
    set statut = 'BROUILLON', soumis_at = null
    where id = p_programme_id and statut = 'SOUMIS';

  insert into public.notifications (profile_id, type, titre, corps, metadata)
  values (v_vm_id, 'PROGRAMME_REJETE', 'Programme renvoyé pour correction',
    coalesce(p_motif, 'Voir avec votre superviseur.'),
    jsonb_build_object('programme_id', p_programme_id));
end;
$function$;