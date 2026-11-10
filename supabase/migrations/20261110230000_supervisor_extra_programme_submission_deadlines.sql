-- Allow supervisors to grant or revoke extra submission deadlines for VMs in their teams.
create or replace function public.accorder_delai_supplementaire_programme(
  p_programme_id uuid,
  p_nouvelle_limite timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vm_id uuid;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs'
      using errcode = '42501';
  end if;

  if p_nouvelle_limite is null or p_nouvelle_limite <= public.benin_now() then
    raise exception 'Le délai supplémentaire doit être fixé dans le futur';
  end if;

  select vm_id into v_vm_id
  from public.programmes_hebdomadaires
  where id = p_programme_id and statut = 'BROUILLON'
  for update;

  if not found then
    raise exception 'Programme introuvable ou déjà soumis';
  end if;

  if not public.is_admin() and not public.is_vm_in_my_scope(v_vm_id) then
    raise exception 'Programme hors de votre périmètre de supervision'
      using errcode = '42501';
  end if;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
     set delai_supplementaire_jusqu_a = p_nouvelle_limite
   where id = p_programme_id and statut = 'BROUILLON';
end;
$$;

create or replace function public.retirer_delai_supplementaire_programme(
  p_programme_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vm_id uuid;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs'
      using errcode = '42501';
  end if;

  select vm_id into v_vm_id
  from public.programmes_hebdomadaires
  where id = p_programme_id and statut = 'BROUILLON'
  for update;

  if not found then
    raise exception 'Programme introuvable ou non modifiable';
  end if;

  if not public.is_admin() and not public.is_vm_in_my_scope(v_vm_id) then
    raise exception 'Programme hors de votre périmètre de supervision'
      using errcode = '42501';
  end if;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
     set delai_supplementaire_jusqu_a = null
   where id = p_programme_id and statut = 'BROUILLON';
end;
$$;

revoke all on function public.accorder_delai_supplementaire_programme(uuid, timestamptz) from public;
grant execute on function public.accorder_delai_supplementaire_programme(uuid, timestamptz) to authenticated;
revoke all on function public.retirer_delai_supplementaire_programme(uuid) from public;
grant execute on function public.retirer_delai_supplementaire_programme(uuid) to authenticated;
