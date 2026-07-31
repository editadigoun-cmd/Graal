-- GRAAL Medical Solutions — schéma initial
-- 001: extensions & types énumérés

create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('vm', 'superviseur', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type secteur_code as enum ('A', 'B');
exception when duplicate_object then null; end $$;

do $$ begin
  create type potentiel_client as enum ('GROS', 'MOYEN', 'FAIBLE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type specialite_client as enum (
    'GENERALISTE', 'GYNECOLOGUE', 'PEDIATRE', 'CARDIOLOGUE', 'RHUMATOLOGUE',
    'ORL', 'AUTRE_SPECIALITE', 'MATERNITE', 'DISPENSAIRE', 'PHARMACIE'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type jour_semaine as enum ('LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI');
exception when duplicate_object then null; end $$;

do $$ begin
  create type type_visite as enum ('MEDICAL', 'PHARMACIE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type statut_programme as enum ('BROUILLON', 'SOUMIS', 'VALIDE', 'VERROUILLE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type statut_visite as enum ('REALISEE', 'HORS_PROGRAMME', 'NON_FAITE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stock_niveau as enum ('RUPTURE', 'FAIBLE', 'CORRECT', 'BON');
exception when duplicate_object then null; end $$;

do $$ begin
  create type statut_cloture as enum ('EN_ATTENTE', 'CLOTUREE', 'CLOTUREE_FORCEE');
exception when duplicate_object then null; end $$;

-- Fuseau horaire fixe de référence pour toutes les règles temporelles ("heure serveur")
create or replace function public.benin_now()
returns timestamp
language sql
stable
as $$
  select (now() at time zone 'Africa/Porto-Novo');
$$;

create or replace function public.benin_today()
returns date
language sql
stable
as $$
  select (public.benin_now())::date;
$$;

create or replace function public.jour_semaine_benin(d date)
returns jour_semaine
language sql
immutable
as $$
  select case extract(isodow from d)
    when 1 then 'LUNDI'::jour_semaine
    when 2 then 'MARDI'::jour_semaine
    when 3 then 'MERCREDI'::jour_semaine
    when 4 then 'JEUDI'::jour_semaine
    when 5 then 'VENDREDI'::jour_semaine
    else null
  end;
$$;
