-- Clôture forcée à 20h Bénin pour tous les VM actifs, y compris sans ligne précréée.
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

  -- Jours ouvrés uniquement, à partir de 20h heure du Bénin.
  if extract(isodow from v_jour) > 5 or public.benin_now()::time < time '20:00' then
    return;
  end if;

  -- 20h au Bénin correspond à 19h UTC.
  v_heure_cloture := (v_jour::timestamp + time '19:00') at time zone 'UTC';

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

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'graal-cloture-forcee-complete') then
    perform cron.schedule(
      'graal-cloture-forcee-complete',
      '* * * * 1-5',
      'select public.forcer_clotures_du_jour_complet();'
    );
  end if;
end;
$$;
