alter table public.visites
  alter column client_id drop not null,
  add column if not exists client_nom_libre text,
  add column if not exists client_specialite_libre text,
  add column if not exists client_centre_libre text,
  add column if not exists activites_menees text;
