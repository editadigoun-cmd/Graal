-- Autoriser la clôture lorsque le jour source est validé individuellement,
-- même si les autres jours du programme hebdomadaire sont encore en brouillon.
do $$
declare
  v_def text;
  v_old_select text := 'select pl.id, pl.jour, ph.semaine_debut, ph.statut, ph.vm_id,
           ph.semaine_debut + public.jour_offset(pl.jour) as date_source';
  v_new_select text := 'select pl.id, pl.jour, ph.semaine_debut, ph.statut, ph.vm_id,
           ph.semaine_debut + public.jour_offset(pl.jour) as date_source,
           exists (
             select 1 from public.programme_jours_validation pjv
             where pjv.programme_id = ph.id
               and pjv.jour = pl.jour
               and pjv.statut = ''VALIDE''
           ) as jour_valide';
  v_old_if text := 'if v_source.id is null or v_source.statut not in (''VALIDE'', ''VERROUILLE'') then';
  v_new_if text := 'if v_source.id is null or not (
      v_source.statut in (''VALIDE'', ''VERROUILLE'')
      or coalesce(v_source.jour_valide, false)
    ) then';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'cloturer_journee'
    and pg_get_function_identity_arguments(p.oid) =
      'p_photo_path text, p_photo_latitude double precision, p_photo_longitude double precision, p_reports jsonb';

  if v_def is null then
    raise exception 'Fonction cloturer_journee introuvable';
  end if;

  if position(v_new_select in v_def) > 0 and position(v_new_if in v_def) > 0 then
    raise notice 'Correction déjà appliquée';
  else
    if position(v_old_select in v_def) = 0 then
      raise exception 'Bloc SELECT attendu introuvable';
    end if;
    if position(v_old_if in v_def) = 0 then
      raise exception 'Condition de validation attendue introuvable';
    end if;

    v_def := replace(v_def, v_old_select, v_new_select);
    v_def := replace(v_def, v_old_if, v_new_if);
    execute v_def;
  end if;
end $$;
