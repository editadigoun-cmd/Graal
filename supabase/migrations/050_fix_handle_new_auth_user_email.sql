-- 050: handle_new_auth_user() ne peuplait plus profiles.email depuis 040_zones.sql (qui a
-- réécrit la fonction pour ajouter zone_id, mais sans reprendre la colonne email ajoutée par
-- 018_activity_log_and_email.sql) — régression restée invisible car aucun compte n'avait été
-- créé depuis 040. Trouvée en créant des comptes VM (équipe TIL, cf. update-user-email) : sans
-- ce correctif, profiles.email de chaque nouveau compte serait resté NULL, cassant le renvoi
-- d'invitation et la détection de doublon par email dans create-user.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, secteur, equipe_id, zone_id, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'vm'),
    nullif(new.raw_user_meta_data->>'secteur', '')::secteur_code,
    nullif(new.raw_user_meta_data->>'equipe_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'zone_id', '')::uuid,
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
