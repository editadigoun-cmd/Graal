-- Plusieurs photos prises directement pendant la clôture de journée.
alter table public.clotures_journalieres
  add column if not exists photo_paths text[] not null default '{}';

create or replace function public.cloturer_journee_multi(
  p_photo_paths text[],
  p_photo_latitude double precision,
  p_photo_longitude double precision,
  p_reports jsonb default '[]'::jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_photo_paths is null or cardinality(p_photo_paths) = 0 then
    raise exception 'Au moins une photo est obligatoire.';
  end if;

  perform public.cloturer_journee(
    p_photo_path := p_photo_paths[1],
    p_photo_latitude := p_photo_latitude,
    p_photo_longitude := p_photo_longitude,
    p_reports := p_reports
  );

  update public.clotures_journalieres
     set photo_paths = p_photo_paths
   where vm_id = auth.uid()
     and jour = (now() at time zone 'Africa/Porto-Novo')::date;

  return true;
end;
$$;

revoke all on function public.cloturer_journee_multi(text[], double precision, double precision, jsonb) from public;
grant execute on function public.cloturer_journee_multi(text[], double precision, double precision, jsonb) to authenticated;
