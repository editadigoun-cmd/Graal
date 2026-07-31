-- 002: équipes, superviseurs, profils utilisateurs

create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'vm',
  secteur secteur_code,               -- obligatoire pour un VM, null pour superviseur/admin
  equipe_id uuid references public.equipes(id) on delete set null, -- équipe du VM
  phone text,
  avatar_url text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vm_a_un_secteur check (role <> 'vm' or secteur is not null),
  constraint vm_a_une_equipe check (role <> 'vm' or equipe_id is not null)
);

create index profiles_role_idx on public.profiles(role);
create index profiles_equipe_idx on public.profiles(equipe_id);
create index profiles_secteur_idx on public.profiles(secteur);

-- Un superviseur peut être rattaché à une ou plusieurs équipes
create table public.superviseur_equipes (
  superviseur_id uuid not null references public.profiles(id) on delete cascade,
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  primary key (superviseur_id, equipe_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription (métadonnées passées par le client à l'auth.signUp)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, secteur, equipe_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'vm'),
    nullif(new.raw_user_meta_data->>'secteur', '')::secteur_code,
    nullif(new.raw_user_meta_data->>'equipe_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Helpers de rôle (SECURITY DEFINER, exécutés en tant que propriétaire de la migration
-- afin de contourner les RLS de `profiles` et éviter toute récursion de policy).
create or replace function public.current_role()
returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_secteur()
returns secteur_code
language sql stable security definer set search_path = public as $$
  select secteur from public.profiles where id = auth.uid();
$$;

create or replace function public.current_equipe()
returns uuid
language sql stable security definer set search_path = public as $$
  select equipe_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_superviseur()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'superviseur');
$$;

-- Équipes supervisées par l'utilisateur courant (vide si non superviseur)
create or replace function public.supervised_equipe_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select equipe_id from public.superviseur_equipes where superviseur_id = auth.uid();
$$;

-- Un VM appartient-il à une équipe supervisée par l'utilisateur courant ?
create or replace function public.is_vm_in_my_scope(target_vm uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.is_admin()
    or target_vm = auth.uid()
    or (
      public.is_superviseur()
      and exists (
        select 1 from public.profiles p
        where p.id = target_vm
          and p.equipe_id in (select public.supervised_equipe_ids())
      )
    );
$$;
