-- Module Tournées : demande, validation administrative, exécution journalière et rapport.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.tournees (
  id uuid primary key default gen_random_uuid(),
  demandeur_id uuid not null references public.profiles(id) on delete cascade,
  zone text not null check (length(trim(zone)) between 2 and 160),
  date_debut date not null,
  date_fin date not null,
  avec_portefeuille boolean not null default false,
  statut text not null default 'EN_ATTENTE' check (statut in ('EN_ATTENTE','APPROUVEE','REFUSEE','EN_COURS','TERMINEE')),
  decision_admin_id uuid references public.profiles(id),
  decision_at timestamptz,
  motif_refus text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournees_dates_valides check (date_fin >= date_debut)
);
create index tournees_demandeur_idx on public.tournees(demandeur_id, created_at desc);
create index tournees_statut_idx on public.tournees(statut, date_debut);

create table public.tournee_jours (
  id uuid primary key default gen_random_uuid(),
  tournee_id uuid not null references public.tournees(id) on delete cascade,
  jour date not null,
  statut text not null default 'A_DEMARRER' check (statut in ('A_DEMARRER','EN_COURS','TERMINEE')),
  demarree_at timestamptz,
  terminee_at timestamptz,
  unique(tournee_id, jour)
);
create table public.tournee_rapports (
  id uuid primary key default gen_random_uuid(),
  tournee_jour_id uuid not null unique references public.tournee_jours(id) on delete cascade,
  resume text not null default '',
  observations text,
  soumis_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.tournee_rencontres (
  id uuid primary key default gen_random_uuid(),
  rapport_id uuid not null references public.tournee_rapports(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  nom text not null,
  centre text,
  specialite public.specialite_client,
  potentiel public.potentiel_client,
  telephone text,
  notes text,
  nouveau_prescripteur boolean not null default false,
  created_at timestamptz not null default now(),
  check (length(trim(nom)) > 0)
);
create index tournee_rencontres_rapport_idx on public.tournee_rencontres(rapport_id);

alter table public.tournees enable row level security;
alter table public.tournee_jours enable row level security;
alter table public.tournee_rapports enable row level security;
alter table public.tournee_rencontres enable row level security;

create policy tournees_read_scope on public.tournees for select to authenticated using (
  public.is_admin()
  or demandeur_id = auth.uid()
  or (public.is_superviseur() and exists (
    select 1 from public.profiles vm
    where vm.id = tournees.demandeur_id and vm.equipe_id in (select public.supervised_equipe_ids())
  ))
);
create policy tournee_jours_read_scope on public.tournee_jours for select to authenticated using (
  exists (select 1 from public.tournees t where t.id = tournee_jours.tournee_id and (
    public.is_admin() or t.demandeur_id = auth.uid()
    or (public.is_superviseur() and exists (select 1 from public.profiles vm where vm.id=t.demandeur_id and vm.equipe_id in (select public.supervised_equipe_ids())))
  ))
);
create policy tournee_rapports_read_scope on public.tournee_rapports for select to authenticated using (
  exists (select 1 from public.tournee_jours j join public.tournees t on t.id=j.tournee_id where j.id=tournee_rapports.tournee_jour_id and (
    public.is_admin() or t.demandeur_id=auth.uid()
    or (public.is_superviseur() and exists (select 1 from public.profiles vm where vm.id=t.demandeur_id and vm.equipe_id in (select public.supervised_equipe_ids())))
  ))
);
create policy tournee_rencontres_read_scope on public.tournee_rencontres for select to authenticated using (
  exists (select 1 from public.tournee_rapports r join public.tournee_jours j on j.id=r.tournee_jour_id join public.tournees t on t.id=j.tournee_id where r.id=tournee_rencontres.rapport_id and (
    public.is_admin() or t.demandeur_id=auth.uid()
    or (public.is_superviseur() and exists (select 1 from public.profiles vm where vm.id=t.demandeur_id and vm.equipe_id in (select public.supervised_equipe_ids())))
  ))
);
create policy tournee_report_owner_insert on public.tournee_rapports for insert to authenticated with check (
  exists (select 1 from public.tournee_jours j join public.tournees t on t.id=j.tournee_id where j.id=tournee_jour_id and t.demandeur_id=auth.uid() and t.statut in ('APPROUVEE','EN_COURS'))
);
create policy tournee_report_owner_update on public.tournee_rapports for update to authenticated using (
  soumis_at is null and exists (select 1 from public.tournee_jours j join public.tournees t on t.id=j.tournee_id where j.id=tournee_jour_id and t.demandeur_id=auth.uid())
) with check (
  soumis_at is null and exists (select 1 from public.tournee_jours j join public.tournees t on t.id=j.tournee_id where j.id=tournee_jour_id and t.demandeur_id=auth.uid())
);
create policy tournee_encounter_owner_insert on public.tournee_rencontres for insert to authenticated with check (
  exists (select 1 from public.tournee_rapports r join public.tournee_jours j on j.id=r.tournee_jour_id join public.tournees t on t.id=j.tournee_id where r.id=rapport_id and r.soumis_at is null and t.demandeur_id=auth.uid())
);
create policy tournee_encounter_owner_delete on public.tournee_rencontres for delete to authenticated using (
  exists (select 1 from public.tournee_rapports r join public.tournee_jours j on j.id=r.tournee_jour_id join public.tournees t on t.id=j.tournee_id where r.id=rapport_id and r.soumis_at is null and t.demandeur_id=auth.uid())
);

create or replace function private.demander_tournee_impl(p_zone text, p_date_debut date, p_date_fin date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_role public.user_role; v_avec_portefeuille boolean;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select role into v_role from public.profiles where id=auth.uid() and actif;
  if v_role <> 'vm' then raise exception 'Seuls les VM peuvent demander une tournée.'; end if;
  if nullif(trim(p_zone),'') is null or p_date_debut is null or p_date_fin is null or p_date_fin < p_date_debut or p_date_debut < public.benin_today() then
    raise exception 'Vérifiez la zone et les dates de la tournée.';
  end if;
  if p_date_fin - p_date_debut > 30 then raise exception 'Une tournée ne peut pas dépasser 31 jours.'; end if;
  select exists(select 1 from public.portefeuille where vm_id=auth.uid()) into v_avec_portefeuille;
  insert into public.tournees(demandeur_id,zone,date_debut,date_fin,avec_portefeuille)
  values(auth.uid(),trim(p_zone),p_date_debut,p_date_fin,v_avec_portefeuille) returning id into v_id;
  insert into public.notifications(profile_id,type,titre,corps,metadata)
  select p.id,'TOURNEE_DEMANDE','Nouvelle demande de tournée',
    (select full_name from public.profiles where id=auth.uid()) || ' demande une tournée à ' || trim(p_zone) || ' du ' || to_char(p_date_debut,'DD/MM/YYYY') || ' au ' || to_char(p_date_fin,'DD/MM/YYYY') || '.',
    jsonb_build_object('tournee_id',v_id,'demandeur_id',auth.uid())
  from public.profiles p where p.role='admin' and p.actif;
  return v_id;
end; $$;

create or replace function private.decider_tournee_impl(p_tournee_id uuid,p_approuver boolean,p_motif text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_demandeur uuid; v_zone text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Action réservée à l’administrateur.'; end if;
  select demandeur_id,zone into v_demandeur,v_zone from public.tournees where id=p_tournee_id and statut='EN_ATTENTE' for update;
  if v_demandeur is null then raise exception 'Cette demande a déjà été traitée ou n’existe plus.'; end if;
  update public.tournees set statut=case when p_approuver then 'APPROUVEE' else 'REFUSEE' end,
    decision_admin_id=auth.uid(),decision_at=now(),motif_refus=case when p_approuver then null else nullif(trim(coalesce(p_motif,'')),'') end,updated_at=now()
  where id=p_tournee_id;
  if p_approuver then
    insert into public.tournee_jours(tournee_id,jour)
    select p_tournee_id, g::date
    from public.tournees t, generate_series(t.date_debut::timestamp,t.date_fin::timestamp,interval '1 day') g
    where t.id=p_tournee_id
    on conflict(tournee_id,jour) do nothing;
  end if;
  insert into public.notifications(profile_id,type,titre,corps,metadata) values(
    v_demandeur,case when p_approuver then 'TOURNEE_APPROUVEE' else 'TOURNEE_REFUSEE' end,
    case when p_approuver then 'Tournée approuvée' else 'Tournée refusée' end,
    case when p_approuver then 'Votre tournée à '||v_zone||' est approuvée.' else 'Votre tournée à '||v_zone||' a été refusée.'||case when nullif(trim(coalesce(p_motif,'')),'') is null then '' else ' Motif : '||trim(p_motif) end end,
    jsonb_build_object('tournee_id',p_tournee_id));
end; $$;

create or replace function private.demarrer_journee_tournee_impl(p_tournee_id uuid,p_jour date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_jour_id uuid; v_statut text;
begin
  select statut into v_statut from public.tournees where id=p_tournee_id and demandeur_id=auth.uid() and statut in ('APPROUVEE','EN_COURS')
    and p_jour between date_debut and date_fin for update;
  if v_statut is null or p_jour <> public.benin_today() then raise exception 'Tournée non approuvée ou la journée ne correspond pas à la date du jour.'; end if;
  insert into public.tournee_jours(tournee_id,jour,statut,demarree_at)
  values(p_tournee_id,p_jour,'EN_COURS',now())
  on conflict(tournee_id,jour) do update set statut='EN_COURS',demarree_at=coalesce(public.tournee_jours.demarree_at,now())
  where public.tournee_jours.statut <> 'TERMINEE'
  returning id into v_jour_id;
  if v_jour_id is null then raise exception 'Cette journée est déjà clôturée.'; end if;
  update public.tournees set statut='EN_COURS',updated_at=now() where id=p_tournee_id;
  insert into public.tournee_rapports(tournee_jour_id) values(v_jour_id) on conflict(tournee_jour_id) do nothing;
  return v_jour_id;
end; $$;

create or replace function private.soumettre_rapport_tournee_impl(p_jour_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_tournee_id uuid; v_resume text;
begin
  select t.id,r.resume into v_tournee_id,v_resume
  from public.tournee_jours j join public.tournees t on t.id=j.tournee_id
  join public.tournee_rapports r on r.tournee_jour_id=j.id
  where j.id=p_jour_id and t.demandeur_id=auth.uid() and j.statut='EN_COURS' and r.soumis_at is null for update of j,r;
  if v_tournee_id is null then raise exception 'Rapport introuvable ou journée déjà soumise.'; end if;
  if nullif(trim(coalesce(v_resume,'')),'') is null then raise exception 'Le résumé de la tournée est obligatoire.'; end if;
  update public.tournee_rapports set soumis_at=now(),updated_at=now() where tournee_jour_id=p_jour_id;
  update public.tournee_jours set statut='TERMINEE',terminee_at=now() where id=p_jour_id;
  if not exists(select 1 from public.tournee_jours where tournee_id=v_tournee_id and statut <> 'TERMINEE') then
    update public.tournees set statut='TERMINEE',updated_at=now() where id=v_tournee_id;
  end if;
end; $$;

create or replace function private.ajouter_nouveau_prescripteur_tournee_impl(
 p_rapport_id uuid,p_nom text,p_centre text,p_specialite public.specialite_client,p_potentiel public.potentiel_client,p_contacts text,p_notes text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_tournee public.tournees%rowtype; v_jour date; v_client uuid; v_secteur public.secteur_code;
begin
 select t.* into v_tournee from public.tournee_rapports r join public.tournee_jours j on j.id=r.tournee_jour_id join public.tournees t on t.id=j.tournee_id
 where r.id=p_rapport_id and r.soumis_at is null and t.demandeur_id=auth.uid() and t.avec_portefeuille and t.statut='EN_COURS';
 if not found then raise exception 'Ajout réservé à une tournée active avec portefeuille.'; end if;
 if nullif(trim(p_nom),'') is null or p_specialite is null or p_potentiel is null then raise exception 'Nom, spécialité et potentiel sont obligatoires.'; end if;
 select secteur into v_secteur from public.profiles where id=auth.uid();
 if v_secteur is null then raise exception 'Votre secteur n’est pas renseigné.'; end if;
 insert into public.clients(nom,centre,specialite,potentiel,secteur,contacts,observations,frequence_visite_mensuelle)
 values(trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,v_secteur,nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''),public.default_frequence(p_potentiel))
 returning id into v_client;
 insert into public.portefeuille(client_id,vm_id) values(v_client,auth.uid());
 insert into public.tournee_rencontres(rapport_id,client_id,nom,centre,specialite,potentiel,telephone,notes,nouveau_prescripteur)
 values(p_rapport_id,v_client,trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''),true);
 return v_client;
end; $$;

-- Les fonctions privilégiées restent dans un schéma non exposé ; les RPC publiques
-- sont SECURITY INVOKER et délèguent aux fonctions privées qui vérifient auth.uid() et le rôle.
revoke all on function private.demander_tournee_impl(text,date,date) from public;
revoke all on function private.decider_tournee_impl(uuid,boolean,text) from public;
revoke all on function private.demarrer_journee_tournee_impl(uuid,date) from public;
revoke all on function private.soumettre_rapport_tournee_impl(uuid) from public;
revoke all on function private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,text,text) from public;
grant execute on function private.demander_tournee_impl(text,date,date) to authenticated;
grant execute on function private.decider_tournee_impl(uuid,boolean,text) to authenticated;
grant execute on function private.demarrer_journee_tournee_impl(uuid,date) to authenticated;
grant execute on function private.soumettre_rapport_tournee_impl(uuid) to authenticated;
grant execute on function private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,text,text) to authenticated;

create or replace function public.demander_tournee(p_zone text,p_date_debut date,p_date_fin date)
returns uuid language sql security invoker set search_path=public,private as $fn$ select private.demander_tournee_impl(p_zone,p_date_debut,p_date_fin); $fn$;
create or replace function public.decider_tournee(p_tournee_id uuid,p_approuver boolean,p_motif text default null)
returns void language sql security invoker set search_path=public,private as $fn$ select private.decider_tournee_impl(p_tournee_id,p_approuver,p_motif); $fn$;
create or replace function public.demarrer_journee_tournee(p_tournee_id uuid,p_jour date)
returns uuid language sql security invoker set search_path=public,private as $fn$ select private.demarrer_journee_tournee_impl(p_tournee_id,p_jour); $fn$;
create or replace function public.soumettre_rapport_tournee(p_jour_id uuid)
returns void language sql security invoker set search_path=public,private as $fn$ select private.soumettre_rapport_tournee_impl(p_jour_id); $fn$;
create or replace function public.ajouter_nouveau_prescripteur_tournee(p_rapport_id uuid,p_nom text,p_centre text,p_specialite public.specialite_client,p_potentiel public.potentiel_client,p_contacts text,p_notes text)
returns uuid language sql security invoker set search_path=public,private as $fn$ select private.ajouter_nouveau_prescripteur_tournee_impl(p_rapport_id,p_nom,p_centre,p_specialite,p_potentiel,p_contacts,p_notes); $fn$;
revoke all on function public.demander_tournee(text,date,date) from public;
revoke all on function public.decider_tournee(uuid,boolean,text) from public;
revoke all on function public.demarrer_journee_tournee(uuid,date) from public;
revoke all on function public.soumettre_rapport_tournee(uuid) from public;
revoke all on function public.ajouter_nouveau_prescripteur_tournee(uuid,text,text,public.specialite_client,public.potentiel_client,text,text) from public;
grant execute on function public.demander_tournee(text,date,date) to authenticated;
grant execute on function public.decider_tournee(uuid,boolean,text) to authenticated;
grant execute on function public.demarrer_journee_tournee(uuid,date) to authenticated;
grant execute on function public.soumettre_rapport_tournee(uuid) to authenticated;
grant execute on function public.ajouter_nouveau_prescripteur_tournee(uuid,text,text,public.specialite_client,public.potentiel_client,text,text) to authenticated;
