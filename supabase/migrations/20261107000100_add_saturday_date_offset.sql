-- Permet à la vue des visites du jour de calculer la date des visites du samedi.
CREATE OR REPLACE FUNCTION public.jour_offset(j public.jour_semaine)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE j
    WHEN 'LUNDI' THEN 0
    WHEN 'MARDI' THEN 1
    WHEN 'MERCREDI' THEN 2
    WHEN 'JEUDI' THEN 3
    WHEN 'VENDREDI' THEN 4
    WHEN 'SAMEDI' THEN 5
  END;
$function$;
