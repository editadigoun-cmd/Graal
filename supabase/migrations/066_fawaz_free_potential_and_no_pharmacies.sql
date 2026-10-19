-- Fawaz has a portfolio heavily weighted toward GROS clients and no pharmacies.
-- Keep ordinary VM composition rules unchanged; bypass potential-based caps and pharmacy
-- requirements for Fawaz only, while preserving portfolio, active-client, duplicate,
-- submission-deadline, and daily medical coverage checks.
do $migration$
declare
  v text;
begin
  select pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure) into v;

  if position('Fawaz ne programme pas de pharmacies' in v) = 0 then
    v := replace(v,
      '  if prog.mode_pharmacie_uniquement and new.type_visite <> ''PHARMACIE'' then',
      '  if public.is_fawaz_vm(prog.vm_id) and new.type_visite = ''PHARMACIE'' then raise exception ''Fawaz ne programme pas de pharmacies''; end if;' || chr(10) ||
      '  if prog.mode_pharmacie_uniquement and new.type_visite <> ''PHARMACIE'' then');
  end if;

  -- Skip Thursday/Friday potential caps for Fawaz.
  v := replace(v,
    '  if new.jour in (''JEUDI'', ''VENDREDI'') then',
    '  if not public.is_fawaz_vm(prog.vm_id) and new.jour in (''JEUDI'', ''VENDREDI'') then');

  -- Skip Monday-Wednesday medium-potential cap and day/potential hierarchy for Fawaz.
  v := replace(v,
    '  if new.type_visite = ''MEDICAL'' and cl.potentiel = ''MOYEN'' and new.jour in (''LUNDI'', ''MARDI'', ''MERCREDI'') then',
    '  if not public.is_fawaz_vm(prog.vm_id) and new.type_visite = ''MEDICAL'' and cl.potentiel = ''MOYEN'' and new.jour in (''LUNDI'', ''MARDI'', ''MERCREDI'') then');
  v := replace(v,
    '  elsif not public.potentiel_autorise(new.jour, cl.potentiel) then',
    '  elsif not public.is_fawaz_vm(prog.vm_id) and not public.potentiel_autorise(new.jour, cl.potentiel) then');
  execute v;

  select pg_get_functiondef('public.soumettre_programme_hebdomadaire(uuid)'::regprocedure) into v;

  -- Fawaz still needs medical coverage, but does not need pharmacies.
  v := replace(v,
    'or r.nb_pharmacie < min_pharmacie_jour then',
    'or (not public.is_fawaz_vm(prog.vm_id) and r.nb_pharmacie < min_pharmacie_jour) then');

  -- Remove all Thursday/Friday potential caps for Fawaz, regardless of category mix.
  v := replace(v,
    'if nb_jeudi_gros > (case when public.is_fawaz_vm(prog.vm_id) then 10 else 5 end) or (not public.is_fawaz_vm(prog.vm_id) and nb_jeudi_faible > 3) then',
    'if not public.is_fawaz_vm(prog.vm_id) and (nb_jeudi_gros > 5 or nb_jeudi_faible > 3) then');
  v := replace(v,
    'if nb_vendredi_gros > (case when public.is_fawaz_vm(prog.vm_id) then 7 else 3 end) or (not public.is_fawaz_vm(prog.vm_id) and nb_vendredi_faible > 5) then',
    'if not public.is_fawaz_vm(prog.vm_id) and (nb_vendredi_gros > 3 or nb_vendredi_faible > 5) then');
  execute v;
end
$migration$;
