create or replace function public.guard_programme_ligne_jour_valide()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_programme uuid;
  v_jour public.jour_semaine;
  v_statut text;
  v_limite timestamptz;
  v_delai timestamptz;
  v_old_statut text;
  v_old_limite timestamptz;
  v_old_delai timestamptz;
begin
  v_programme := case when tg_op = 'DELETE' then old.programme_id else new.programme_id end;
  v_jour := case when tg_op = 'DELETE' then old.jour else new.jour end;

  select pjv.statut, pjv.date_limite, ph.delai_supplementaire_jusqu_a
    into v_statut, v_limite, v_delai
  from public.programmes_hebdomadaires ph
  left join public.programme_jours_validation pjv
    on pjv.programme_id = ph.id and pjv.jour = v_jour
  where ph.id = v_programme;

  if not public.is_admin() then
    if v_statut = 'VALIDE' then
      raise exception 'Ce jour du programme est déjà validé et verrouillé.';
    end if;
    if v_limite is not null and now() > v_limite
       and (v_delai is null or now() > v_delai) then
      raise exception 'Le délai de modification de ce jour est dépassé.';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and (old.programme_id, old.jour) is distinct from (new.programme_id, new.jour)
     and not public.is_admin() then
    select pjv.statut, pjv.date_limite, ph.delai_supplementaire_jusqu_a
      into v_old_statut, v_old_limite, v_old_delai
    from public.programmes_hebdomadaires ph
    left join public.programme_jours_validation pjv
      on pjv.programme_id = ph.id and pjv.jour = old.jour
    where ph.id = old.programme_id;

    if v_old_statut = 'VALIDE'
       or (v_old_limite is not null and now() > v_old_limite
           and (v_old_delai is null or now() > v_old_delai)) then
      raise exception 'Le jour d’origine est verrouillé ou son délai est dépassé.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;
