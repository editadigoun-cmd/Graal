create or replace function public.invalider_jour_programme(
  p_programme_id uuid,
  p_jour public.jour_semaine
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_statut public.statut_programme;
  v_jours_valides integer;
begin
  if not public.is_admin() then
    raise exception 'Action réservée à un administrateur.';
  end if;

  select statut into v_statut
  from public.programmes_hebdomadaires
  where id = p_programme_id
  for update;

  if not found then
    raise exception 'Programme introuvable.';
  end if;

  if not exists (
    select 1 from public.programme_jours_validation
    where programme_id = p_programme_id
      and jour = p_jour
      and statut = 'VALIDE'
  ) then
    raise exception 'Cette journée n’est pas validée.';
  end if;

  perform set_config('graal.internal_rpc', 'on', true);

  update public.programme_jours_validation
  set statut = 'EN_COURS',
      valide_at = null,
      valide_par = null
  where programme_id = p_programme_id and jour = p_jour;

  if v_statut in ('VALIDE', 'VERROUILLE') then
    update public.programmes_hebdomadaires
    set statut = 'SOUMIS', valide_at = null, valide_par = null
    where id = p_programme_id;
  end if;

  select count(*) into v_jours_valides
  from public.programme_jours_validation
  where programme_id = p_programme_id
    and statut = 'VALIDE'
    and jour in ('LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI');

  return jsonb_build_object('statut','EN_COURS','programme_id',p_programme_id,'jour',p_jour,'jours_valides_restants',v_jours_valides);
end;
$function$;

revoke all on function public.invalider_jour_programme(uuid, public.jour_semaine) from public;
grant execute on function public.invalider_jour_programme(uuid, public.jour_semaine) to authenticated;
