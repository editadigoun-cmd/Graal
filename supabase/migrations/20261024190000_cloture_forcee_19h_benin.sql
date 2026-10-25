-- Clôture automatique à 19 h, heure du Bénin (18 h UTC), du lundi au vendredi.
-- La tâche cron existante continue de s'exécuter chaque minute ; cette fonction n'agit
-- qu'à partir de 19 h locales et ne remplace que les clôtures encore en attente.
create or replace function public.forcer_clotures_du_jour_complet()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour date;
  v_heure_cloture timestamptz;
begin
  v_jour := public.benin_today();

  if extract(isodow from v_jour) > 5 or public.benin_now()::time < time '19:00' then
    return;
  end if;

  -- 19 h au Bénin (UTC+1) correspond à 18 h UTC.
  v_heure_cloture := (v_jour::timestamp + time '18:00') at time zone 'UTC';

  perform set_config('graal.internal_rpc', 'on', true);

  insert into public.clotures_journalieres
    (vm_id, jour, statut, heure_cloture, en_retard)
  select p.id, v_jour, 'CLOTUREE_FORCEE', v_heure_cloture, true
  from public.profiles p
  where p.role = 'vm' and p.actif = true
  on conflict (vm_id, jour) do update
    set statut = 'CLOTUREE_FORCEE',
        heure_cloture = excluded.heure_cloture,
        en_retard = true
    where public.clotures_journalieres.statut = 'EN_ATTENTE';
end;
$$;

revoke all on function public.forcer_clotures_du_jour_complet() from public, anon, authenticated;
