-- Store the intended sector on each weekly programme and alternate it week by week.
alter table public.programmes_hebdomadaires
  add column if not exists secteur public.secteur_code;

with programme_sector as (
  select p.id,
         (select c.secteur
          from public.programme_lignes pl
          join public.clients c on c.id = pl.client_id
          where pl.programme_id = p.id and c.secteur is not null
          group by c.secteur
          order by count(*) desc, c.secteur
          limit 1) as ligne_secteur
  from public.programmes_hebdomadaires p
),
previous_sector as (
  select p.id,
         (select prev.secteur
          from public.programmes_hebdomadaires prev
          where prev.vm_id = p.vm_id
            and prev.semaine_debut < p.semaine_debut
            and prev.secteur is not null
          order by prev.semaine_debut desc
          limit 1) as secteur_precedent
  from public.programmes_hebdomadaires p
)
update public.programmes_hebdomadaires p
set secteur = coalesce(
  ps.ligne_secteur,
  case prev.secteur_precedent
    when 'A' then 'B'::public.secteur_code
    when 'B' then 'A'::public.secteur_code
    else null
  end,
  case prof.secteur
    when 'A' then 'B'::public.secteur_code
    when 'B' then 'A'::public.secteur_code
    else null
  end
)
from programme_sector ps
join previous_sector prev on prev.id = ps.id
left join public.profiles prof
  on prof.id = (select p2.vm_id from public.programmes_hebdomadaires p2 where p2.id = ps.id)
where p.id = ps.id and p.secteur is null;
