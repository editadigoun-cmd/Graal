create or replace function public.rappel_soumission_programme_parametre()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_today date := public.benin_today();
  v_semaine date := v_today + (8 - extract(isodow from v_today))::int;
  v_heure time := coalesce(public.parametre_text('heure_limite_soumission_programme', '14:00'), '14:00')::time;
  v_deadline_standard timestamptz := (((v_semaine - 2)::timestamp + v_heure) at time zone 'Africa/Porto-Novo');
  v_now timestamptz := date_trunc('minute', public.benin_now());
  v_vm record;
  v_deadline timestamptz;
  v_offset integer;
  v_deadline_label text;
begin
  for v_vm in
    select p.id, ph.delai_supplementaire_jusqu_a, ph.statut as programme_statut
    from public.profiles p
    left join public.programmes_hebdomadaires ph
      on ph.vm_id = p.id and ph.semaine_debut = v_semaine
    where p.role = 'vm' and p.actif
      and (ph.id is null or ph.statut = 'BROUILLON')
  loop
    v_deadline := v_deadline_standard;
    if v_vm.delai_supplementaire_jusqu_a is not null
       and v_vm.delai_supplementaire_jusqu_a > v_deadline then
      v_deadline := v_vm.delai_supplementaire_jusqu_a;
    end if;

    foreach v_offset in array array[1200, 210, 120, 60, 30, 5]
    loop
      if v_now = date_trunc('minute', v_deadline - make_interval(mins => v_offset)) then
        v_deadline_label := to_char(v_deadline at time zone 'Africa/Porto-Novo', 'DD/MM/YYYY à HH24:MI');
        if not exists (
          select 1 from public.notifications n
          where n.profile_id = v_vm.id
            and n.type = 'RAPPEL_SOUMISSION'
            and n.metadata ->> 'deadline_effective' = v_deadline::text
            and n.metadata ->> 'rappel_offset_minutes' = v_offset::text
        ) then
          insert into public.notifications (profile_id, type, titre, corps, metadata)
          values (
            v_vm.id, 'RAPPEL_SOUMISSION', 'Programme hebdomadaire à soumettre',
            format('Pensez à soumettre votre programme de la semaine du %s avant le %s (heure du Bénin).',
              to_char(v_semaine, 'DD/MM/YYYY'), v_deadline_label),
            jsonb_build_object(
              'semaine_debut', v_semaine,
              'deadline_effective', v_deadline,
              'rappel_offset_minutes', v_offset,
              'deadline_standard', v_deadline_standard,
              'prolongation_individuelle', v_deadline > v_deadline_standard
            )
          );
        end if;
      end if;
    end loop;
  end loop;
end;
$function$;
