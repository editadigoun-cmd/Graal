create or replace function public.verifier_quotas_potentiel_jour(p_programme_id uuid, p_jour public.jour_semaine)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_gros integer;
  v_moyen integer;
  v_faible integer;
  v_vm_id uuid;
  v_vm text;
  v_pharmacie_uniquement boolean;
begin
  select ph.vm_id, upper(coalesce(p.full_name, '')), coalesce(ph.mode_pharmacie_uniquement, false)
    into v_vm_id, v_vm, v_pharmacie_uniquement
  from public.programmes_hebdomadaires ph
  join public.profiles p on p.id = ph.vm_id
  where ph.id = p_programme_id;

  if v_vm_id is null then
    raise exception 'Programme introuvable';
  end if;
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if v_vm_id <> auth.uid()
     and not public.is_admin()
     and not public.is_vm_in_my_scope(v_vm_id) then
    raise exception 'Accès non autorisé à ce programme';
  end if;

  if coalesce(v_pharmacie_uniquement, false) then return; end if;
  if v_vm_id = '2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f'::uuid or v_vm like '%FAWAZ%' then return; end if;

  select count(*) filter (where c.potentiel::text = 'GROS'),
         count(*) filter (where c.potentiel::text = 'MOYEN'),
         count(*) filter (where c.potentiel::text = 'FAIBLE')
    into v_gros, v_moyen, v_faible
  from public.programme_lignes pl
  join public.clients c on c.id = pl.client_id
  where pl.programme_id = p_programme_id and pl.jour = p_jour;

  if p_jour in ('LUNDI'::public.jour_semaine, 'MARDI'::public.jour_semaine, 'MERCREDI'::public.jour_semaine) then
    if v_gros < 12 then raise exception '% : il faut au moins 12 clients GROS (actuellement %).', p_jour, v_gros; end if;
    if v_moyen > 5 then raise exception '% : maximum 5 clients MOYENS (actuellement %).', p_jour, v_moyen; end if;
  elsif p_jour = 'JEUDI'::public.jour_semaine then
    if v_gros > 8 then raise exception 'Jeudi : maximum 8 clients GROS (actuellement %).', v_gros; end if;
    if v_faible > 2 then raise exception 'Jeudi : maximum 2 clients FAIBLES (actuellement %).', v_faible; end if;
  elsif p_jour = 'VENDREDI'::public.jour_semaine then
    if v_gros > 5 then raise exception 'Vendredi : maximum 5 clients GROS (actuellement %).', v_gros; end if;
    if v_faible > 3 then raise exception 'Vendredi : maximum 3 clients FAIBLES (actuellement %).', v_faible; end if;
  end if;
end;
$function$;
