-- 060: les anciens clients de l'application doivent aussi respecter les nouvelles règles de report.
create or replace function public.cloturer_journee(
  p_photo_path text,
  p_photo_latitude double precision,
  p_photo_longitude double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  return public.cloturer_journee(
    p_photo_path,
    p_photo_latitude,
    p_photo_longitude,
    '[]'::jsonb
  );
end;
$function$;
