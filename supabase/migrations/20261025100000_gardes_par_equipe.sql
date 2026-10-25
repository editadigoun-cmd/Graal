-- PROVISIT : jours de garde autorisés selon l'équipe du délégué.
-- Les gardes restent démarrées après la clôture quotidienne ; ce contrôle définit les jours planifiés.
create or replace function public.verifier_jour_garde_equipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe text;
  v_jour_iso integer;
begin
  select upper(trim(e.nom)) into v_equipe
  from public.profiles p
  left join public.equipes e on e.id = p.equipe_id
  where p.id = new.vm_id;

  v_jour_iso := extract(isodow from new.jour)::integer;

  if v_equipe = 'PROPHADIS' and v_jour_iso not in (1, 3) then
    raise exception 'Les gardes PROPHADIS sont planifiées le lundi et le mercredi.';
  elsif v_equipe = 'ODYPAHARM' and v_jour_iso not in (2, 4) then
    raise exception 'Les gardes ODYPAHARM sont planifiées le mardi et le jeudi.';
  elsif v_equipe in ('TIL', 'TIL HEALTH CARE') and v_jour_iso not in (2, 3, 4) then
    raise exception 'Les gardes TIL sont planifiées le mardi, le mercredi et le jeudi.';
  elsif coalesce(v_equipe, '') not in ('PROPHADIS', 'ODYPAHARM', 'TIL', 'TIL HEALTH CARE') then
    raise exception 'Aucun calendrier de garde configuré pour cette équipe.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verifier_jour_garde_equipe on public.gardes;
create trigger trg_verifier_jour_garde_equipe
before insert or update of vm_id, jour on public.gardes
for each row execute function public.verifier_jour_garde_equipe();

revoke all on function public.verifier_jour_garde_equipe() from public, anon, authenticated;
