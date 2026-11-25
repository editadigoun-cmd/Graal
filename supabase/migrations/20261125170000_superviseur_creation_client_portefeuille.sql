create or replace function public.superviseur_creer_client_portefeuille(
  p_nom text,
  p_centre text,
  p_specialite text,
  p_potentiel text,
  p_secteur text,
  p_frequence integer,
  p_contacts text default null,
  p_observations text default null,
  p_vm_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_vm_id uuid;
begin
  if auth.uid() is null or not public.is_superviseur() then
    raise exception 'Accès réservé aux superviseurs.';
  end if;
  if nullif(trim(p_nom), '') is null then
    raise exception 'Le nom du client est obligatoire.';
  end if;
  if coalesce(p_frequence, 0) < 1 then
    raise exception 'La fréquence mensuelle doit être au moins égale à 1.';
  end if;
  foreach v_vm_id in array coalesce(p_vm_ids, '{}'::uuid[]) loop
    if not exists (
      select 1 from public.profiles vm
      where vm.id = v_vm_id and vm.role = 'vm'
        and vm.equipe_id in (select public.supervised_equipe_ids())
    ) then
      raise exception 'Un ou plusieurs VM sélectionnés ne font pas partie de vos équipes.';
    end if;
  end loop;
  insert into public.clients (
    nom, centre, specialite, potentiel, secteur,
    frequence_visite_mensuelle, contacts, observations, actif
  ) values (
    trim(p_nom), nullif(trim(coalesce(p_centre, '')), ''),
    p_specialite::public.specialite_client,
    nullif(p_potentiel, '')::public.potentiel_client,
    nullif(p_secteur, '')::public.secteur_code,
    p_frequence, nullif(trim(coalesce(p_contacts, '')), ''),
    nullif(trim(coalesce(p_observations, '')), ''), true
  ) returning id into v_client_id;
  insert into public.portefeuille_superviseurs (client_id, superviseur_id)
  values (v_client_id, auth.uid());
  foreach v_vm_id in array coalesce(p_vm_ids, '{}'::uuid[]) loop
    insert into public.portefeuille (client_id, vm_id)
    values (v_client_id, v_vm_id)
    on conflict (client_id, vm_id) do nothing;
  end loop;
  return v_client_id;
end;
$$;
revoke all on function public.superviseur_creer_client_portefeuille(text,text,text,text,text,integer,text,text,uuid[]) from public;
grant execute on function public.superviseur_creer_client_portefeuille(text,text,text,text,text,integer,text,text,uuid[]) to authenticated;
