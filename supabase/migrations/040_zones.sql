-- 040: zones géographiques des VM (ex: Atlantique 1, Atlantique 2...), gérées par l'admin.
-- Contrairement à équipe/secteur, la zone n'est pas rendue obligatoire au niveau base pour ne
-- pas casser les VM existants sans zone assignée : elle est exigée côté formulaire de création
-- (create-user) pour les nouveaux comptes.

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.zones enable row level security;

create policy zones_select on public.zones for select to authenticated using (true);
create policy zones_write on public.zones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter table public.profiles add column zone_id uuid references public.zones(id) on delete set null;
create index profiles_zone_idx on public.profiles(zone_id);

insert into public.zones (nom) values ('Atlantique 1'), ('Atlantique 2');

-- Le trigger de création automatique du profil doit désormais aussi lire zone_id.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, secteur, equipe_id, zone_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'vm'),
    nullif(new.raw_user_meta_data->>'secteur', '')::secteur_code,
    nullif(new.raw_user_meta_data->>'equipe_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'zone_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
