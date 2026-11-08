-- Autoriser les superviseurs à valider les programmes journaliers des VM de leur périmètre.
-- La validation reste indépendante par jour ; cinq jours validés finalisent la semaine.

create or replace function public.valider_jour_programme(
  p_programme_id uuid,
  p_jour public.jour_semaine,
  p_date_limite timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_vm_id uuid;
  v_statut public.statut_programme;
  v_count integer;
  v_valides integer;
begin
  if not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs.';
  end if;

  select ph.vm_id, ph.statut
    into v_vm_id, v_statut
  from public.programmes_hebdomadaires ph
  where ph.id = p_programme_id
  for update;

  if not found then
    raise exception 'Programme introuvable.';
  end if;

  if not public.is_admin() and not public.is_vm_in_my_scope(v_vm_id) then
    raise exception 'Ce programme ne relève pas de votre périmètre de supervision.';
  end if;

  if v_statut not in ('BROUILLON', 'SOUMIS') then
    raise exception 'Seuls les programmes en cours ou soumis peuvent être validés par journée.';
  end if;

  select count(*) into v_count
  from public.programme_lignes
  where programme_id = p_programme_id and jour = p_jour;

  if v_count = 0 then
    raise exception 'Impossible de valider un jour sans visite programmée.';
  end if;

  insert into public.programme_jours_validation
    (programme_id, jour, statut, valide_at, valide_par, date_limite, updated_at)
  values
    (p_programme_id, p_jour, 'VALIDE', now(), auth.uid(), p_date_limite, now())
  on conflict (programme_id, jour) do update
    set statut = 'VALIDE',
        valide_at = now(),
        valide_par = auth.uid(),
        date_limite = coalesce(p_date_limite, public.programme_jours_validation.date_limite),
        updated_at = now();

  select count(*) into v_valides
  from public.programme_jours_validation
  where programme_id = p_programme_id
    and statut = 'VALIDE'
    and jour in ('LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI');

  if v_valides = 5 then
    update public.programmes_hebdomadaires
    set statut = 'VALIDE',
        soumis_at = coalesce(soumis_at, now())
    where id = p_programme_id
      and statut in ('BROUILLON', 'SOUMIS');
  end if;

  return jsonb_build_object(
    'statut', 'VALIDE',
    'programme_id', p_programme_id,
    'jour', p_jour,
    'jours_valides', v_valides,
    'programme_valide', v_valides = 5
  );
end;
$function$;

revoke all on function public.valider_jour_programme(uuid, public.jour_semaine, timestamptz) from public, anon, authenticated;
grant execute on function public.valider_jour_programme(uuid, public.jour_semaine, timestamptz) to authenticated;
