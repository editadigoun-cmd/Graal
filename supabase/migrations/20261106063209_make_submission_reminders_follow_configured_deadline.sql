create or replace function public.rappel_soumission_programme_parametre()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_semaine date := public.benin_today() + (8 - extract(isodow from public.benin_today()))::int;
  v_heure time := coalesce(public.parametre_text('heure_limite_soumission_programme', '14:00'), '14:00')::time;
  v_deadline timestamptz := (((v_semaine - 2)::timestamp + v_heure) at time zone 'Africa/Porto-Novo');
  v_now timestamptz := date_trunc('minute', public.benin_now());
begin
  if v_now in (
    date_trunc('minute', v_deadline - interval '20 hours'),
    date_trunc('minute', v_deadline - interval '210 minutes'),
    date_trunc('minute', v_deadline - interval '120 minutes'),
    date_trunc('minute', v_deadline - interval '60 minutes'),
    date_trunc('minute', v_deadline - interval '30 minutes'),
    date_trunc('minute', v_deadline - interval '5 minutes')
  ) then
    perform public.rappel_soumission_programme();
  end if;
end;
$function$;

do $$
declare r record;
begin
  for r in
    select jobid from cron.job
    where jobname in (
      'graal-rappel-soumission-10h30-samedi',
      'graal-rappel-soumission-18h-vendredi',
      'rappel_programme_samedi_12h_benin',
      'rappel_programme_samedi_13h_benin',
      'rappel_programme_samedi_13h30_benin',
      'rappel_programme_samedi_13h55_benin'
    )
  loop
    perform cron.unschedule(r.jobid);
  end loop;
  if not exists (select 1 from cron.job where jobname = 'graal-rappel-soumission-parametre') then
    perform cron.schedule('graal-rappel-soumission-parametre', '* * * * *', 'select public.rappel_soumission_programme_parametre();');
  end if;
end
$$;
