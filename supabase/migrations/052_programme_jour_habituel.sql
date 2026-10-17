-- 052: enforce the client's habitual visit days at database level.
-- Unknown/free-text values are left permissive; recognized weekday tokens are enforced.
create or replace function public.trg_programme_ligne_jour_habituel()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_habituel text;
  v_jour_tokens text[];
  v_reconnu boolean := false;
  v_autorise boolean := false;
  v_token text;
begin
  select c.jour_heure_habituel
    into v_habituel
  from public.clients c
  where c.id = new.client_id;

  if v_habituel is null or btrim(v_habituel) = '' then
    return new;
  end if;

  -- Strip the time portion, then split common formats such as L/M/MER/J/V 10H.
  v_habituel := upper(unaccent(btrim(v_habituel)));
  v_habituel := regexp_replace(v_habituel, '[0-9].*$', '');
  v_jour_tokens := regexp_split_to_array(v_habituel, '[/,;[:space:]]+');

  foreach v_token in array v_jour_tokens loop
    case v_token
      when 'L', 'LU', 'LUN', 'LUNDI' then
        v_reconnu := true;
        if new.jour = 'LUNDI' then v_autorise := true; end if;
      when 'M', 'MA', 'MAR', 'MARDI' then
        v_reconnu := true;
        if new.jour = 'MARDI' then v_autorise := true; end if;
      when 'MER', 'MERCREDI' then
        v_reconnu := true;
        if new.jour = 'MERCREDI' then v_autorise := true; end if;
      when 'J', 'JE', 'JEU', 'JEUDI' then
        v_reconnu := true;
        if new.jour = 'JEUDI' then v_autorise := true; end if;
      when 'V', 'VE', 'VEN', 'VENDREDI' then
        v_reconnu := true;
        if new.jour = 'VENDREDI' then v_autorise := true; end if;
      else
        null;
    end case;
  end loop;

  if v_reconnu and not v_autorise then
    raise exception 'Jour incompatible : le client est habituellement disponible « % » et ne peut pas être programmé le %',
      v_habituel, new.jour;
  end if;

  return new;
end;
$$;

drop trigger if exists programme_lignes_habitual_day on public.programme_lignes;
create trigger programme_lignes_habitual_day
  before insert or update of client_id, jour on public.programme_lignes
  for each row execute function public.trg_programme_ligne_jour_habituel();
