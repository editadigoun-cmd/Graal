-- ODYPHARM2: jeudi et vendredi, maximum 2 GROS médicaux, sans minimum.
-- Les MOYENS et FAIBLES restent autorisés même si aucun GROS n'est disponible.
create or replace function public.enforce_odypharm2_medical_gros_cap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_equipe_id uuid;
  v_potentiel public.potentiel_client;
  v_count integer;
begin
  if new.jour not in ('JEUDI', 'VENDREDI') or new.type_visite <> 'MEDICAL' then
    return new;
  end if;

  select p.equipe_id into v_equipe_id
  from public.programmes_hebdomadaires prog
  join public.profiles p on p.id = prog.vm_id
  where prog.id = new.programme_id;

  if v_equipe_id <> 'd8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid then
    return new;
  end if;

  select c.potentiel into v_potentiel
  from public.clients c
  where c.id = new.client_id;

  if v_potentiel <> 'GROS' then
    return new;
  end if;

  select count(*) into v_count
  from public.programme_lignes pl
  join public.clients c on c.id = pl.client_id
  where pl.programme_id = new.programme_id
    and pl.jour = new.jour
    and pl.type_visite = 'MEDICAL'
    and c.potentiel = 'GROS'
    and (tg_op <> 'UPDATE' or pl.id <> new.id);

  if v_count >= 2 then
    raise exception 'ODYPHARM2 : maximum 2 GROS médicaux le jeudi et le vendredi. Les MOYENS et FAIBLES restent libres.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_odypharm2_medical_gros_cap on public.programme_lignes;
create trigger trg_odypharm2_medical_gros_cap
before insert or update of programme_id, client_id, jour, type_visite
on public.programme_lignes
for each row
execute function public.enforce_odypharm2_medical_gros_cap();
