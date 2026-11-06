create or replace function public.provision_forum_superviseurs()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs';
  end if;

  select id into v_id from public.conversations where type='FORUM_MANAGER' limit 1;
  if v_id is null then
    insert into public.conversations (nom,type,created_by)
    values ('Superviseurs & Administration','FORUM_MANAGER',auth.uid())
    returning id into v_id;
  end if;
  insert into public.conversation_participants (conversation_id,profile_id)
  select v_id,p.id from public.profiles p
  where p.role in ('admin','superviseur')
  on conflict do nothing;
  return v_id;
end;
$function$;

create or replace function public.client_deja_vu_semaine_precedente(p_vm_id uuid, p_client_id uuid, p_semaine_cible date)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if p_vm_id <> auth.uid()
     and not public.is_admin()
     and not public.is_vm_in_my_scope(p_vm_id) then
    raise exception 'Accès non autorisé à ce portefeuille';
  end if;

  if exists (
    select 1 from public.programmes_hebdomadaires p
    where p.vm_id = p_vm_id
      and p.semaine_debut = p_semaine_cible
      and p.mode_pharmacie_uniquement = true
  ) then
    return false;
  end if;
  return exists (
    select 1 from public.visites v
    where v.vm_id = p_vm_id
      and v.client_id = p_client_id
      and v.jour >= p_semaine_cible - 7
      and v.jour < p_semaine_cible
      and v.statut in ('REALISEE','HORS_PROGRAMME')
  );
end;
$function$;

create or replace function public.client_frequence_autorisee(p_vm uuid, p_client uuid, p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if p_vm <> auth.uid()
     and not public.is_admin()
     and not public.is_vm_in_my_scope(p_vm) then
    raise exception 'Accès non autorisé à ce portefeuille';
  end if;
  return exists (
    select 1
    from public.autorisations_frequence_client a
    where a.vm_id = p_vm
      and a.client_id = p_client
      and a.actif
      and p_date between a.date_debut and a.date_fin
  );
end;
$function$;
