-- 025: corrige trg_log_activity() (018), qui cassait silencieusement toute UPDATE sur
-- `parametres` (et aurait cassé toute UPDATE sur `programmes_hebdomadaires`,
-- `reporting_hebdomadaire` dès que la branche 'profiles' était atteinte en premier dans
-- la chaîne elsif).
--
-- Cause : PL/pgSQL résout les champs old.xxx/new.xxx à la préparation de CHAQUE ligne
-- elsif dès qu'elle est atteinte dans le flux de contrôle, indépendamment du court-circuit
-- du AND — donc `old.actif` échouait ("record old has no field actif") dès que cette ligne
-- était évaluée pour une table qui n'a pas de colonne actif (ex: parametres), même si
-- TG_TABLE_NAME = 'profiles' était faux. Restructuré en IF imbriqués par TG_TABLE_NAME pour
-- que les champs spécifiques à une table ne soient jamais atteints lors d'un déclenchement
-- sur une autre table.

create or replace function public.trg_log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_action text;
  v_label text;
begin
  select full_name into v_actor_name from public.profiles where id = v_actor;
  v_actor_name := coalesce(v_actor_name, 'Système');

  if TG_TABLE_NAME = 'profiles' then
    if TG_OP = 'INSERT' then
      v_action := 'Compte créé';
      v_label := new.full_name;
    elsif TG_OP = 'UPDATE' and old.actif and not new.actif then
      v_action := 'Compte désactivé';
      v_label := new.full_name;
    elsif TG_OP = 'UPDATE' and not old.actif and new.actif then
      v_action := 'Compte réactivé';
      v_label := new.full_name;
    else
      return coalesce(new, old);
    end if;
  elsif TG_TABLE_NAME = 'equipes' then
    if TG_OP = 'INSERT' then
      v_action := 'Équipe créée';
      v_label := new.nom;
    else
      return coalesce(new, old);
    end if;
  elsif TG_TABLE_NAME = 'parametres' then
    if TG_OP = 'UPDATE' and old.value is distinct from new.value then
      v_action := 'Paramètre modifié';
      v_label := coalesce(new.description, new.key) || ' → ' || new.value::text;
    else
      return coalesce(new, old);
    end if;
  elsif TG_TABLE_NAME = 'programmes_hebdomadaires' then
    if TG_OP = 'UPDATE' and old.statut is distinct from new.statut then
      v_action := case
        when new.statut = 'SOUMIS' then 'Programme soumis'
        when new.statut = 'VALIDE' then 'Programme validé'
        when new.statut = 'VERROUILLE' then 'Programme verrouillé'
        when new.statut = 'BROUILLON' and old.statut = 'SOUMIS' then 'Programme rejeté'
        else 'Programme mis à jour'
      end;
      select full_name into v_label from public.profiles where id = new.vm_id;
    else
      return coalesce(new, old);
    end if;
  elsif TG_TABLE_NAME = 'clotures_journalieres' then
    if TG_OP = 'INSERT' then
      v_action := 'Journée clôturée';
      select full_name into v_label from public.profiles where id = new.vm_id;
    else
      return coalesce(new, old);
    end if;
  elsif TG_TABLE_NAME = 'reporting_hebdomadaire' then
    if TG_OP = 'UPDATE' and old.visa_superviseur_id is null and new.visa_superviseur_id is not null then
      v_action := 'Reporting visé';
      select full_name into v_label from public.profiles where id = new.vm_id;
    else
      return coalesce(new, old);
    end if;
  else
    return coalesce(new, old);
  end if;

  insert into public.activity_log (actor_id, actor_name, action, entity_type, entity_label)
  values (v_actor, v_actor_name, v_action, TG_TABLE_NAME, v_label);

  return coalesce(new, old);
end;
$$;
