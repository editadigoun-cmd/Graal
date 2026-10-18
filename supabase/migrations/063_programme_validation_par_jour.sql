-- 063: Validation, verrouillage et échéances indépendants par jour du planning.
create table if not exists public.programme_jours_validation (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes_hebdomadaires(id) on delete cascade,
  jour public.jour_semaine not null,
  statut text not null default 'EN_COURS' check (statut in ('EN_COURS','VALIDE')),
  valide_at timestamptz,
  valide_par uuid references public.profiles(id),
  date_limite timestamptz,
  updated_at timestamptz not null default now(),
  unique(programme_id, jour),
  check ((statut = 'EN_COURS' and valide_at is null and valide_par is null) or (statut = 'VALIDE' and valide_at is not null and valide_par is not null))
);
create index if not exists programme_jours_validation_programme_idx on public.programme_jours_validation(programme_id);
alter table public.programme_jours_validation enable row level security;
drop policy if exists programme_jours_validation_select on public.programme_jours_validation;
create policy programme_jours_validation_select on public.programme_jours_validation for select using (
  exists (select 1 from public.programmes_hebdomadaires ph where ph.id = programme_id and (ph.vm_id = auth.uid() or public.is_admin() or public.is_vm_in_my_scope(ph.vm_id)))
);
drop policy if exists programme_jours_validation_admin_all on public.programme_jours_validation;
create policy programme_jours_validation_admin_all on public.programme_jours_validation for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_programme_ligne_jour_valide()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_programme uuid; v_jour public.jour_semaine; v_statut text; v_limite timestamptz;
begin
  v_programme := case when tg_op = 'DELETE' then old.programme_id else new.programme_id end;
  v_jour := case when tg_op = 'DELETE' then old.jour else new.jour end;
  select statut,date_limite into v_statut,v_limite from public.programme_jours_validation where programme_id=v_programme and jour=v_jour;
  if not public.is_admin() then
    if v_statut='VALIDE' then raise exception 'Ce jour du programme est déjà validé et verrouillé.'; end if;
    if v_limite is not null and now()>v_limite then raise exception 'Le délai de modification de ce jour est dépassé.'; end if;
  end if;
  if tg_op = 'UPDATE' and (old.programme_id, old.jour) is distinct from (new.programme_id, new.jour) and not public.is_admin() then
    if exists(select 1 from public.programme_jours_validation pj where pj.programme_id=old.programme_id and pj.jour=old.jour and (pj.statut='VALIDE' or (pj.date_limite is not null and now()>pj.date_limite))) then raise exception 'Le jour d’origine est verrouillé ou son délai est dépassé.'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
drop trigger if exists trg_guard_programme_ligne_jour_valide on public.programme_lignes;
create trigger trg_guard_programme_ligne_jour_valide before insert or update or delete on public.programme_lignes for each row execute function public.guard_programme_ligne_jour_valide();

create or replace function public.valider_jour_programme(p_programme_id uuid, p_jour public.jour_semaine, p_date_limite timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
 if not public.is_admin() then raise exception 'Action réservée à un administrateur.'; end if;
 if not exists(select 1 from public.programmes_hebdomadaires where id=p_programme_id) then raise exception 'Programme introuvable.'; end if;
 select count(*) into v_count from public.programme_lignes where programme_id=p_programme_id and jour=p_jour;
 if v_count=0 then raise exception 'Impossible de valider un jour sans visite programmée.'; end if;
 insert into public.programme_jours_validation(programme_id,jour,statut,valide_at,valide_par,date_limite,updated_at)
 values(p_programme_id,p_jour,'VALIDE',now(),auth.uid(),p_date_limite,now())
 on conflict(programme_id,jour) do update set statut='VALIDE',valide_at=now(),valide_par=auth.uid(),date_limite=excluded.date_limite,updated_at=now();
 return jsonb_build_object('statut','VALIDE','programme_id',p_programme_id,'jour',p_jour,'date_limite',p_date_limite);
end; $$;
revoke all on function public.valider_jour_programme(uuid,public.jour_semaine,timestamptz) from public, anon, authenticated;
grant execute on function public.valider_jour_programme(uuid,public.jour_semaine,timestamptz) to authenticated;

-- Pour les programmes déjà présents de la semaine du 19 octobre 2026 :
-- Pénélope, Christel et Herbert ont jusqu'au mardi 23 h (heure du Bénin) pour les jours non validés.
-- Les autres VM ont jusqu'au lundi 23 h.
insert into public.programme_jours_validation(programme_id,jour,statut,date_limite)
select pr.id, j.jour, 'EN_COURS',
       case when upper(trim(p.full_name)) in ('DENAHOU PENELOPE','HOUNKPATIN CHRISTEL','GNAWOE HERBERT')
            then ((pr.semaine_debut + 1)::timestamp + interval '23 hours') at time zone 'Africa/Porto-Novo'
            else (pr.semaine_debut::timestamp + interval '23 hours') at time zone 'Africa/Porto-Novo' end
from public.programmes_hebdomadaires pr join public.profiles p on p.id=pr.vm_id
cross join (values ('LUNDI'::public.jour_semaine),('MARDI'::public.jour_semaine),('MERCREDI'::public.jour_semaine),('JEUDI'::public.jour_semaine),('VENDREDI'::public.jour_semaine)) as j(jour)
where pr.semaine_debut='2026-10-19'
on conflict(programme_id,jour) do update set date_limite=excluded.date_limite,updated_at=now();

-- Validation administrative des journées déjà programmées.
insert into public.programme_jours_validation(programme_id,jour,statut,valide_at,valide_par,updated_at)
select distinct pr.id, pl.jour, 'VALIDE', now(), admin.id, now()
from public.programmes_hebdomadaires pr
join public.profiles p on p.id=pr.vm_id
join public.programme_lignes pl on pl.programme_id=pr.id
cross join (select id from public.profiles where lower(role::text)='admin' order by full_name limit 1) admin
where pr.semaine_debut='2026-10-19'
  and pl.jour='LUNDI'

on conflict(programme_id,jour) do update set statut='VALIDE',valide_at=now(),valide_par=excluded.valide_par,updated_at=now();

insert into public.programme_jours_validation(programme_id,jour,statut,valide_at,valide_par,updated_at)
select distinct pr.id, pl.jour, 'VALIDE', now(), admin.id, now()
from public.programmes_hebdomadaires pr
join public.profiles p on p.id=pr.vm_id
join public.programme_lignes pl on pl.programme_id=pr.id
cross join (select id from public.profiles where lower(role::text)='admin' order by full_name limit 1) admin
where pr.semaine_debut='2026-10-19' and pl.jour='MARDI'
  and upper(trim(p.full_name)) in ('DENAHOU PENELOPE','HOUNKPATIN CHRISTEL','GNAWOE HERBERT')
on conflict(programme_id,jour) do update set statut='VALIDE',valide_at=now(),valide_par=excluded.valide_par,updated_at=now();
