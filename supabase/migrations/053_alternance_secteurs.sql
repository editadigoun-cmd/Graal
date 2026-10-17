-- 053: enforce weekly A/B rotation and prevent cross-sector programme lines.
create or replace function public.trg_programme_secteur_alternance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_secteur_precedent public.secteur_code;
  v_secteur_profil public.secteur_code;
  v_secteur_attendu public.secteur_code;
begin
  select p.secteur
    into v_secteur_precedent
  from public.programmes_hebdomadaires p
  where p.vm_id = new.vm_id
    and p.semaine_debut < new.semaine_debut
  order by p.semaine_debut desc
  limit 1;

  if v_secteur_precedent is not null then
    v_secteur_attendu := case v_secteur_precedent
      when 'A' then 'B'::public.secteur_code
      when 'B' then 'A'::public.secteur_code
      else null
    end;
  else
    select pr.secteur into v_secteur_profil
    from public.profiles pr
    where pr.id = new.vm_id;

    v_secteur_attendu := case v_secteur_profil
      when 'A' then 'B'::public.secteur_code
      when 'B' then 'A'::public.secteur_code
      else null
    end;
  end if;

  if v_secteur_attendu is not null and new.secteur is distinct from v_secteur_attendu then
    raise exception 'Alternance des secteurs invalide : le programme de la semaine du % doit être en secteur %.',
      new.semaine_debut, v_secteur_attendu;
  end if;

  return new;
end;
$$;

drop trigger if exists programmes_secteur_alternance on public.programmes_hebdomadaires;
create trigger programmes_secteur_alternance
  before insert or update of vm_id, semaine_debut, secteur
  on public.programmes_hebdomadaires
  for each row execute function public.trg_programme_secteur_alternance();

create or replace function public.trg_programme_ligne_meme_secteur()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_secteur_programme public.secteur_code;
  v_secteur_client public.secteur_code;
begin
  select p.secteur into v_secteur_programme
  from public.programmes_hebdomadaires p
  where p.id = new.programme_id;

  select c.secteur into v_secteur_client
  from public.clients c
  where c.id = new.client_id;

  if v_secteur_programme is not null
     and v_secteur_client is distinct from v_secteur_programme then
    raise exception 'Client hors secteur : ce programme est en secteur % et le client est en secteur %.',
      v_secteur_programme, coalesce(v_secteur_client::text, 'non défini');
  end if;

  return new;
end;
$$;

drop trigger if exists programme_lignes_same_sector on public.programme_lignes;
create trigger programme_lignes_same_sector
  before insert or update of programme_id, client_id
  on public.programme_lignes
  for each row execute function public.trg_programme_ligne_meme_secteur();
