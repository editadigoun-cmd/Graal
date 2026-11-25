-- Support multiple evidence photos for guard-duty closure.
alter table public.gardes
  add column if not exists photo_paths text[] not null default '{}';

create or replace function public.terminer_garde(
  p_photo_paths text[],
  p_photo_latitude double precision,
  p_photo_longitude double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vm uuid := auth.uid();
  v_jour date := public.benin_today();
begin
  if v_vm is null then
    raise exception 'Non authentifié';
  end if;

  if p_photo_paths is null or cardinality(p_photo_paths) = 0
     or array_position(p_photo_paths, null) is not null then
    raise exception 'Au moins une photo de fin de garde est obligatoire';
  end if;

  if not public.coord_plausible(p_photo_latitude, p_photo_longitude) then
    raise exception 'Coordonnées GPS de la photo invalides ou hors zone (Bénin)';
  end if;

  update public.gardes
  set statut = 'TERMINEE', terminee_at = now(),
      photo_path = p_photo_paths[1], photo_paths = p_photo_paths,
      photo_latitude = p_photo_latitude, photo_longitude = p_photo_longitude
  where vm_id = v_vm and jour = v_jour and statut = 'EN_COURS';

  if not found then
    raise exception 'Aucune garde en cours à clôturer';
  end if;

  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select distinct coalesce(se.superviseur_id, adm.id), 'GARDE_TERMINEE', 'Garde terminée',
    format('%s a terminé sa garde du %s.', coalesce((select full_name from public.profiles where id = v_vm), 'Un VM'), v_jour),
    jsonb_build_object('vm_id', v_vm, 'jour', v_jour, 'photo_paths', p_photo_paths)
  from public.profiles p
  left join public.superviseur_equipes se on se.equipe_id = p.equipe_id
  left join public.profiles adm on adm.role = 'admin'
  where p.id = v_vm and (se.superviseur_id is not null or adm.id is not null);

  return jsonb_build_object('statut', 'TERMINEE', 'heure', now(), 'nombre_photos', cardinality(p_photo_paths));
end;
$$;

revoke execute on function public.terminer_garde(text[], double precision, double precision) from public;
grant execute on function public.terminer_garde(text[], double precision, double precision) to authenticated;
