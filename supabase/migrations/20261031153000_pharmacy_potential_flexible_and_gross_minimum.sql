-- Pharmacies : nombre libre par potentiel, sans FAIBLE du lundi au mercredi.
-- Au moins une pharmacie GROS doit être programmée chaque jour lundi, mardi et mercredi.
create or replace function public.guard_pharmacie_potentiel_jour()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_potentiel public.potentiel_client;
begin
  select c.potentiel into v_potentiel
  from public.clients c where c.id = new.client_id;

  if new.type_visite = 'PHARMACIE'
     and new.jour in ('LUNDI','MARDI','MERCREDI')
     and v_potentiel = 'FAIBLE' then
    raise exception 'Les pharmacies de potentiel FAIBLE ne sont pas autorisées du lundi au mercredi.';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_pharmacie_potentiel_jour on public.programme_lignes;
create trigger guard_pharmacie_potentiel_jour
before insert or update of client_id, jour, type_visite
on public.programme_lignes
for each row execute function public.guard_pharmacie_potentiel_jour();

create or replace function public.guard_gros_pharmacie_debut_semaine()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_jour public.jour_semaine;
begin
  if new.statut is distinct from old.statut and new.statut = 'SOUMIS'::public.statut_programme then
    foreach v_jour in array array['LUNDI'::public.jour_semaine,'MARDI'::public.jour_semaine,'MERCREDI'::public.jour_semaine]
    loop
      if not exists (
        select 1
        from public.programme_lignes pl
        join public.clients c on c.id = pl.client_id
        where pl.programme_id = new.id
          and pl.jour = v_jour
          and pl.type_visite = 'PHARMACIE'
          and c.potentiel = 'GROS'
      ) then
        raise exception 'Il faut programmer au moins une pharmacie de potentiel GROS le %.', v_jour;
      end if;
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_gros_pharmacie_debut_semaine on public.programmes_hebdomadaires;
create trigger guard_gros_pharmacie_debut_semaine
before update of statut on public.programmes_hebdomadaires
for each row execute function public.guard_gros_pharmacie_debut_semaine();
