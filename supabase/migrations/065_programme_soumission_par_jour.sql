-- 064: soumission indépendante des journées et validation complète du programme.
alter table public.programme_jours_validation
  add column if not exists soumis_at timestamptz;

alter table public.programme_jours_validation
  drop constraint if exists programme_jours_validation_statut_check;
alter table public.programme_jours_validation
  add constraint programme_jours_validation_statut_check
  check ((statut in ('EN_COURS','SOUMIS') and valide_at is null and valide_par is null) or (statut='VALIDE' and valide_at is not null and valide_par is not null));

create or replace function public.soumettre_jour_programme(p_programme_id uuid, p_jour public.jour_semaine)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_programme public.programmes_hebdomadaires%rowtype;
  v_etat public.programme_jours_validation%rowtype;
  v_count integer;
begin
  select * into v_programme from public.programmes_hebdomadaires where id=p_programme_id;
  if not found then raise exception 'Programme introuvable.'; end if;
  if v_programme.vm_id <> auth.uid() and not public.is_admin() then
    raise exception 'Vous ne pouvez soumettre que votre propre programme.';
  end if;
  if v_programme.statut not in ('BROUILLON','SOUMIS') then
    raise exception 'Ce programme n’est plus modifiable.';
  end if;
  select * into v_etat from public.programme_jours_validation
    where programme_id=p_programme_id and jour=p_jour;
  if v_etat.statut='VALIDE' then raise exception 'Cette journée est déjà validée.'; end if;
  if v_etat.date_limite is not null and now()>v_etat.date_limite
     and (v_programme.delai_supplementaire_jusqu_a is null or now()>v_programme.delai_supplementaire_jusqu_a) then
    raise exception 'Le délai de soumission de cette journée est dépassé.';
  end if;
  select count(*) into v_count from public.programme_lignes where programme_id=p_programme_id and jour=p_jour;
  if v_count=0 then raise exception 'Ajoutez au moins un client à cette journée avant de la soumettre.'; end if;

  insert into public.programme_jours_validation(programme_id,jour,statut,soumis_at,updated_at)
    values(p_programme_id,p_jour,'SOUMIS',now(),now())
    on conflict(programme_id,jour) do update
      set statut='SOUMIS',soumis_at=now(),updated_at=now()
      where public.programme_jours_validation.statut <> 'VALIDE';

  return jsonb_build_object('statut','SOUMIS','programme_id',p_programme_id,'jour',p_jour,'clients',v_count);
end; $$;

revoke all on function public.soumettre_jour_programme(uuid,public.jour_semaine) from public, anon;
grant execute on function public.soumettre_jour_programme(uuid,public.jour_semaine) to authenticated;

create or replace function public.valider_jour_programme(p_programme_id uuid, p_jour public.jour_semaine, p_date_limite timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_count int;
  v_valides int;
begin
  if not public.is_admin() then raise exception 'Action réservée à un administrateur.'; end if;
  if not exists(select 1 from public.programmes_hebdomadaires where id=p_programme_id) then raise exception 'Programme introuvable.'; end if;
  select count(*) into v_count from public.programme_lignes where programme_id=p_programme_id and jour=p_jour;
  if v_count=0 then raise exception 'Impossible de valider un jour sans visite programmée.'; end if;

  insert into public.programme_jours_validation(programme_id,jour,statut,valide_at,valide_par,date_limite,updated_at)
    values(p_programme_id,p_jour,'VALIDE',now(),auth.uid(),p_date_limite,now())
    on conflict(programme_id,jour) do update
      set statut='VALIDE',valide_at=now(),valide_par=auth.uid(),date_limite=coalesce(p_date_limite,public.programme_jours_validation.date_limite),updated_at=now();

  select count(*) into v_valides from public.programme_jours_validation
    where programme_id=p_programme_id and statut='VALIDE'
      and jour in ('LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI');

  if v_valides=5 then
    update public.programmes_hebdomadaires
      set statut='VALIDE', soumis_at=coalesce(soumis_at,now())
      where id=p_programme_id and statut not in ('VALIDE','VERROUILLE');
  end if;

  return jsonb_build_object('statut','VALIDE','programme_id',p_programme_id,'jour',p_jour,'jours_valides',v_valides,'programme_valide',v_valides=5);
end; $$;

revoke all on function public.valider_jour_programme(uuid,public.jour_semaine,timestamptz) from public, anon, authenticated;
grant execute on function public.valider_jour_programme(uuid,public.jour_semaine,timestamptz) to authenticated;
