-- Améliorations du module Tournées : GPS, durée réelle et découverte de clients soumise à validation.
alter table public.tournee_jours
  add column if not exists latitude_depart double precision,
  add column if not exists longitude_depart double precision,
  add column if not exists latitude_cloture double precision,
  add column if not exists longitude_cloture double precision;

create table if not exists public.tournee_decouvertes (
  id uuid primary key default gen_random_uuid(),
  rapport_id uuid not null references public.tournee_rapports(id) on delete cascade,
  nom text not null check (length(trim(nom)) between 2 and 180),
  centre text,
  specialite public.specialite_client not null,
  potentiel public.potentiel_client not null,
  secteur public.secteur_code not null,
  contacts text,
  notes text,
  statut text not null default 'EN_ATTENTE' check (statut in ('EN_ATTENTE','AJOUTE','REFUSE')),
  client_id uuid references public.clients(id) on delete set null,
  valide_par uuid references public.profiles(id),
  valide_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tournee_decouvertes_statut_idx on public.tournee_decouvertes(statut,created_at desc);
alter table public.tournee_decouvertes enable row level security;
grant select on public.tournee_decouvertes to authenticated;

drop policy if exists tournee_decouvertes_read_scope on public.tournee_decouvertes;
create policy tournee_decouvertes_read_scope on public.tournee_decouvertes
for select to authenticated using (
  public.is_admin()
  or exists (
    select 1 from public.tournee_rapports r
    join public.tournee_jours j on j.id=r.tournee_jour_id
    join public.tournees t on t.id=j.tournee_id
    where r.id=tournee_decouvertes.rapport_id and t.demandeur_id=auth.uid()
  )
  or (public.is_superviseur() and exists (
    select 1 from public.tournee_rapports r
    join public.tournee_jours j on j.id=r.tournee_jour_id
    join public.tournees t on t.id=j.tournee_id
    join public.profiles vm on vm.id=t.demandeur_id
    where r.id=tournee_decouvertes.rapport_id and vm.equipe_id in (select public.supervised_equipe_ids())
  ))
);

-- Au lieu de créer directement un client et de l'affecter au portefeuille,
-- le VM déclare une découverte qui attend la validation de l'administration.
create or replace function private.ajouter_nouveau_prescripteur_tournee_impl(
 p_rapport_id uuid,p_nom text,p_centre text,p_specialite public.specialite_client,
 p_potentiel public.potentiel_client,p_contacts text,p_notes text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
 v_tournee public.tournees%rowtype;
 v_client uuid;
 v_secteur public.secteur_code;
 v_decouverte uuid;
begin
 select t.* into v_tournee
 from public.tournee_rapports r
 join public.tournee_jours j on j.id=r.tournee_jour_id
 join public.tournees t on t.id=j.tournee_id
 where r.id=p_rapport_id and r.soumis_at is null
   and t.demandeur_id=auth.uid() and t.avec_portefeuille and t.statut='EN_COURS'
   and j.statut in ('EN_COURS','EFFECTUEE');
 if not found then raise exception 'Ajout réservé à une tournée active avec portefeuille.'; end if;
 if nullif(trim(p_nom),'') is null or p_specialite is null or p_potentiel is null then
   raise exception 'Nom, spécialité et potentiel sont obligatoires.';
 end if;
 select secteur into v_secteur from public.profiles where id=auth.uid();
 if v_secteur is null then raise exception 'Votre secteur n’est pas renseigné.'; end if;
 insert into public.tournee_decouvertes(rapport_id,nom,centre,specialite,potentiel,secteur,contacts,notes)
 values(p_rapport_id,trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,
   v_secteur,nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''))
 returning id into v_decouverte;
 insert into public.tournee_rencontres(rapport_id,client_id,nom,centre,specialite,potentiel,telephone,notes,nouveau_prescripteur)
 values(p_rapport_id,null,trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,
   nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''),true);
 return v_decouverte;
end; $$;

create or replace function private.enregistrer_depart_tournee_gps_impl(
 p_jour_id uuid,p_latitude double precision,p_longitude double precision
) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or p_latitude is null or p_longitude is null
   or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
   raise exception 'Coordonnées GPS invalides.';
 end if;
 update public.tournee_jours j
 set latitude_depart=p_latitude,longitude_depart=p_longitude
 from public.tournees t
 where j.id=p_jour_id and j.tournee_id=t.id and t.demandeur_id=auth.uid()
   and j.statut='EN_COURS' and j.jour=public.benin_today();
 if not found then raise exception 'Impossible d’enregistrer la position de départ.'; end if;
end; $$;

create or replace function private.enregistrer_cloture_tournee_gps_impl(
 p_jour_id uuid,p_latitude double precision,p_longitude double precision
) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Connexion requise.'; end if;
 update public.tournee_jours j
 set latitude_cloture=case when p_latitude between -90 and 90 then p_latitude else null end,
     longitude_cloture=case when p_longitude between -180 and 180 then p_longitude else null end
 from public.tournees t
 where j.id=p_jour_id and j.tournee_id=t.id and t.demandeur_id=auth.uid()
   and j.statut='EN_COURS';
 if not found then raise exception 'Impossible d’enregistrer la position de clôture.'; end if;
end; $$;

create or replace function private.valider_decouverte_tournee_impl(p_decouverte_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare d public.tournee_decouvertes%rowtype; v_vm uuid; v_client uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Action réservée à l’administration.'; end if;
 select td.* into d from public.tournee_decouvertes td
 where td.id=p_decouverte_id and td.statut='EN_ATTENTE' for update;
 if not found then raise exception 'Cette découverte a déjà été traitée ou est introuvable.'; end if;
 select t.demandeur_id into v_vm
 from public.tournee_rapports r join public.tournee_jours j on j.id=r.tournee_jour_id
 join public.tournees t on t.id=j.tournee_id where r.id=d.rapport_id;
 insert into public.clients(nom,centre,specialite,potentiel,secteur,contacts,observations,frequence_visite_mensuelle)
 values(d.nom,d.centre,d.specialite,d.potentiel,d.secteur,d.contacts,d.notes,public.default_frequence(d.potentiel))
 returning id into v_client;
 insert into public.portefeuille(client_id,vm_id) values(v_client,v_vm);
 update public.tournee_decouvertes set statut='AJOUTE',client_id=v_client,valide_par=auth.uid(),valide_at=now()
 where id=p_decouverte_id;
 return v_client;
end; $$;

revoke all on function private.enregistrer_depart_tournee_gps_impl(uuid,double precision,double precision) from public;
revoke all on function private.enregistrer_cloture_tournee_gps_impl(uuid,double precision,double precision) from public;
revoke all on function private.valider_decouverte_tournee_impl(uuid) from public;
grant execute on function private.enregistrer_depart_tournee_gps_impl(uuid,double precision,double precision) to authenticated;
grant execute on function private.enregistrer_cloture_tournee_gps_impl(uuid,double precision,double precision) to authenticated;
grant execute on function private.valider_decouverte_tournee_impl(uuid) to authenticated;

create or replace function public.enregistrer_depart_tournee_gps(p_jour_id uuid,p_latitude double precision,p_longitude double precision)
returns void language sql security invoker set search_path=public,private as $fn$
 select private.enregistrer_depart_tournee_gps_impl(p_jour_id,p_latitude,p_longitude);
$fn$;
create or replace function public.enregistrer_cloture_tournee_gps(p_jour_id uuid,p_latitude double precision,p_longitude double precision)
returns void language sql security invoker set search_path=public,private as $fn$
 select private.enregistrer_cloture_tournee_gps_impl(p_jour_id,p_latitude,p_longitude);
$fn$;
create or replace function public.valider_decouverte_tournee(p_decouverte_id uuid)
returns uuid language sql security invoker set search_path=public,private as $fn$
 select private.valider_decouverte_tournee_impl(p_decouverte_id);
$fn$;
revoke all on function public.enregistrer_depart_tournee_gps(uuid,double precision,double precision) from public;
revoke all on function public.enregistrer_cloture_tournee_gps(uuid,double precision,double precision) from public;
revoke all on function public.valider_decouverte_tournee(uuid) from public;
grant execute on function public.enregistrer_depart_tournee_gps(uuid,double precision,double precision) to authenticated;
grant execute on function public.enregistrer_cloture_tournee_gps(uuid,double precision,double precision) to authenticated;
grant execute on function public.valider_decouverte_tournee(uuid) to authenticated;


-- La durée est figée au moment où le visiteur demande la clôture et ouvre son rapport.
create or replace function private.marquer_tournee_effectuee_impl(p_jour_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  update public.tournee_jours j set statut='EFFECTUEE',terminee_at=coalesce(terminee_at,now())
  from public.tournees t
  where j.id=p_jour_id and j.tournee_id=t.id and t.demandeur_id=auth.uid()
    and t.statut='EN_COURS' and j.jour=public.benin_today() and j.statut='EN_COURS';
  if not found then raise exception 'Journée non démarrée, hors date ou déjà déclarée effectuée.'; end if;
end; $$;
