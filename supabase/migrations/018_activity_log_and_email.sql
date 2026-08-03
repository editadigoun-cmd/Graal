-- 018: colonne email sur profiles (affichage + détection de doublons côté client)
-- et journal d'activité (historique de toutes les actions menées sur la plateforme).

alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;
create index profiles_email_idx on public.profiles(lower(email));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, secteur, equipe_id, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'vm'),
    nullif(new.raw_user_meta_data->>'secteur', '')::secteur_code,
    nullif(new.raw_user_meta_data->>'equipe_id', '')::uuid,
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- ===================== journal d'activité =====================

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'Système',
  action text not null,
  entity_type text not null,
  entity_label text,
  created_at timestamptz not null default now()
);

create index activity_log_created_idx on public.activity_log(created_at desc);

alter table public.activity_log enable row level security;

create policy activity_log_select on public.activity_log for select to authenticated
  using (public.is_admin() or public.is_superviseur());

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

  if TG_TABLE_NAME = 'profiles' and TG_OP = 'INSERT' then
    v_action := 'Compte créé';
    v_label := new.full_name;
  elsif TG_TABLE_NAME = 'profiles' and TG_OP = 'UPDATE' and old.actif and not new.actif then
    v_action := 'Compte désactivé';
    v_label := new.full_name;
  elsif TG_TABLE_NAME = 'profiles' and TG_OP = 'UPDATE' and not old.actif and new.actif then
    v_action := 'Compte réactivé';
    v_label := new.full_name;
  elsif TG_TABLE_NAME = 'equipes' and TG_OP = 'INSERT' then
    v_action := 'Équipe créée';
    v_label := new.nom;
  elsif TG_TABLE_NAME = 'parametres' and TG_OP = 'UPDATE' and old.value is distinct from new.value then
    v_action := 'Paramètre modifié';
    v_label := coalesce(new.description, new.key) || ' → ' || new.value::text;
  elsif TG_TABLE_NAME = 'programmes_hebdomadaires' and TG_OP = 'UPDATE' and old.statut is distinct from new.statut then
    v_action := case
      when new.statut = 'SOUMIS' then 'Programme soumis'
      when new.statut = 'VALIDE' then 'Programme validé'
      when new.statut = 'VERROUILLE' then 'Programme verrouillé'
      when new.statut = 'BROUILLON' and old.statut = 'SOUMIS' then 'Programme rejeté'
      else 'Programme mis à jour'
    end;
    select full_name into v_label from public.profiles where id = new.vm_id;
  elsif TG_TABLE_NAME = 'clotures_journalieres' and TG_OP = 'INSERT' then
    v_action := 'Journée clôturée';
    select full_name into v_label from public.profiles where id = new.vm_id;
  elsif TG_TABLE_NAME = 'reporting_hebdomadaire' and TG_OP = 'UPDATE'
        and old.visa_superviseur_id is null and new.visa_superviseur_id is not null then
    v_action := 'Reporting visé';
    select full_name into v_label from public.profiles where id = new.vm_id;
  else
    return coalesce(new, old);
  end if;

  insert into public.activity_log (actor_id, actor_name, action, entity_type, entity_label)
  values (v_actor, v_actor_name, v_action, TG_TABLE_NAME, v_label);

  return coalesce(new, old);
end;
$$;

revoke execute on function public.trg_log_activity() from public;

create trigger log_activity_profiles
  after insert or update on public.profiles
  for each row execute function public.trg_log_activity();

create trigger log_activity_equipes
  after insert on public.equipes
  for each row execute function public.trg_log_activity();

create trigger log_activity_parametres
  after update on public.parametres
  for each row execute function public.trg_log_activity();

create trigger log_activity_programmes
  after update on public.programmes_hebdomadaires
  for each row execute function public.trg_log_activity();

create trigger log_activity_clotures
  after insert on public.clotures_journalieres
  for each row execute function public.trg_log_activity();

create trigger log_activity_reporting
  after update on public.reporting_hebdomadaire
  for each row execute function public.trg_log_activity();
