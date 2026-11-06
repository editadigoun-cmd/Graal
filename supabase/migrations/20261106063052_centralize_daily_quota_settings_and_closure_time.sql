insert into public.parametres(key,value,description)
values
 ('max_visites_jour','22'::jsonb,'Maximum de visites programmables par VM et par jour'),
 ('max_gros_jeudi','8'::jsonb,'Maximum de clients GROS programmables le jeudi'),
 ('max_gros_vendredi','5'::jsonb,'Maximum de clients GROS programmables le vendredi'),
 ('max_faible_jeudi','2'::jsonb,'Maximum de clients FAIBLE programmables le jeudi'),
 ('max_faible_vendredi','3'::jsonb,'Maximum de clients FAIBLE programmables le vendredi')
on conflict (key) do nothing;

do $migration$
declare v_def text; v_old text; v_new text;
begin
  v_def := pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure);
  v_old := 'if nb_visites_jour >= 22 then';
  v_new := 'if nb_visites_jour >= public.parametre_numeric(''max_visites_jour'', 22)::int then';
  if position(v_old in v_def)=0 then raise exception 'Bloc max visites introuvable dans le trigger'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'if cl.potentiel = ''MOYEN'' and nb_moyen_jour >= 5 then';
  v_new := 'if cl.potentiel = ''MOYEN'' and nb_moyen_jour >= public.parametre_numeric(''nb_max_moyen_lun_mar_mer_jour'', 5)::int then';
  if position(v_old in v_def)=0 then raise exception 'Bloc quota MOYEN introuvable'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'max_gros_jour := case when new.jour = ''JEUDI'' then 8 else 5 end;';
  v_new := 'max_gros_jour := case when new.jour = ''JEUDI'' then public.parametre_numeric(''max_gros_jeudi'', 8)::int else public.parametre_numeric(''max_gros_vendredi'', 5)::int end;';
  if position(v_old in v_def)=0 then raise exception 'Bloc quota GROS introuvable'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'max_faible_jour := case when new.jour = ''JEUDI'' then 2 else 3 end;';
  v_new := 'max_faible_jour := case when new.jour = ''JEUDI'' then public.parametre_numeric(''max_faible_jeudi'', 2)::int else public.parametre_numeric(''max_faible_vendredi'', 3)::int end;';
  if position(v_old in v_def)=0 then raise exception 'Bloc quota FAIBLE introuvable'; end if;
  v_def := replace(v_def,v_old,v_new);
  execute v_def;

  v_def := pg_get_functiondef('public.soumettre_programme_hebdomadaire(uuid)'::regprocedure);
  v_old := 'having count(*) > 22';
  v_new := 'having count(*) > public.parametre_numeric(''max_visites_jour'', 22)::int';
  if position(v_old in v_def)=0 then raise exception 'Bloc max visites introuvable dans soumission'; end if;
  v_def := replace(v_def,v_old,v_new);
  execute v_def;

  v_def := pg_get_functiondef('public.forcer_clotures_du_jour_complet()'::regprocedure);
  v_old := 'v_heure_cloture timestamptz;';
  v_new := 'v_heure_cloture timestamptz;' || chr(10) || '  v_heure_forcee time := public.parametre_text(''heure_cloture_forcee'', ''19:00'')::time;';
  if position(v_old in v_def)=0 then raise exception 'Déclaration horaire clôture introuvable'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'public.benin_now()::time < time ''19:00''';
  v_new := 'public.benin_now()::time < v_heure_forcee';
  if position(v_old in v_def)=0 then raise exception 'Condition horaire clôture introuvable'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := '(v_jour::timestamp + time ''18:00'') at time zone ''UTC''';
  v_new := '(v_jour::timestamp + v_heure_forcee) at time zone ''Africa/Porto-Novo''';
  if position(v_old in v_def)=0 then raise exception 'Timestamp clôture introuvable'; end if;
  v_def := replace(v_def,v_old,v_new);
  execute v_def;
end
$migration$;
