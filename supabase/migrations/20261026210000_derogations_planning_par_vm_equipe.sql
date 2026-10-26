-- Dérogations de planning ciblées par semaine, VM ou équipe.
-- Les dérogations sont administrées depuis l'application et appliquées côté base.

create table if not exists public.derogations_planning (
  id uuid primary key default gen_random_uuid(),
  semaine_debut date not null check (extract(isodow from semaine_debut) = 1),
  vm_id uuid references public.profiles(id) on delete cascade,
  equipe_id uuid references public.equipes(id) on delete cascade,
  lever_zone boolean not null default false,
  lever_potentiel boolean not null default false,
  actif boolean not null default true,
  cree_par uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint derogations_planning_cible check (
    (vm_id is not null and equipe_id is null) or (vm_id is null and equipe_id is not null)
  ),
  constraint derogations_planning_type check (lever_zone or lever_potentiel)
);

create index if not exists derogations_planning_vm_week_idx
  on public.derogations_planning(vm_id, semaine_debut) where actif;
create index if not exists derogations_planning_equipe_week_idx
  on public.derogations_planning(equipe_id, semaine_debut) where actif;

alter table public.derogations_planning enable row level security;
drop policy if exists derogations_planning_admin_select on public.derogations_planning;
create policy derogations_planning_admin_select on public.derogations_planning
  for select to authenticated using (public.is_admin());
drop policy if exists derogations_planning_admin_write on public.derogations_planning;
create policy derogations_planning_admin_write on public.derogations_planning
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.derogation_planning_active(
  p_vm_id uuid, p_semaine_debut date, p_type text
) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.derogations_planning d
    left join public.profiles vm on vm.id = p_vm_id
    where d.actif
      and d.semaine_debut = p_semaine_debut
      and (
        d.vm_id = p_vm_id
        or (d.equipe_id is not null and vm.equipe_id = d.equipe_id)
      )
      and case upper(p_type)
        when 'ZONE' then d.lever_zone
        when 'POTENTIEL' then d.lever_potentiel
        else false
      end
  );
$$;

revoke all on function public.derogation_planning_active(uuid,date,text) from public, anon;
grant execute on function public.derogation_planning_active(uuid,date,text) to authenticated;

create or replace function public.definir_derogation_planning(
  p_semaine_debut date,
  p_vm_id uuid,
  p_equipe_id uuid,
  p_lever_zone boolean,
  p_lever_potentiel boolean,
  p_actif boolean default true
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Action réservée à un administrateur';
  end if;
  if extract(isodow from p_semaine_debut) <> 1 then
    raise exception 'La semaine doit commencer un lundi';
  end if;
  if (p_vm_id is null) = (p_equipe_id is null) then
    raise exception 'Sélectionner soit un VM, soit une équipe';
  end if;
  if not coalesce(p_lever_zone, false) and not coalesce(p_lever_potentiel, false) then
    raise exception 'Sélectionner au moins une contrainte à lever';
  end if;

  insert into public.derogations_planning
    (semaine_debut, vm_id, equipe_id, lever_zone, lever_potentiel, actif, cree_par)
  values
    (p_semaine_debut, p_vm_id, p_equipe_id, p_lever_zone, p_lever_potentiel, p_actif, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.definir_derogation_planning(date,uuid,uuid,boolean,boolean,boolean) from public, anon;
grant execute on function public.definir_derogation_planning(date,uuid,uuid,boolean,boolean,boolean) to authenticated;

-- Une dérogation de zone active autorise la recherche de clients hors portefeuille
-- uniquement lorsqu'elle a été accordée à ce VM ou à son équipe pour une semaine
-- où il possède un programme brouillon.
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.portefeuille p where p.client_id = clients.id and p.vm_id = auth.uid())
  or (public.is_superviseur() and exists (
        select 1 from public.portefeuille p join public.profiles vm on vm.id = p.vm_id
        where p.client_id = clients.id and vm.equipe_id in (select public.supervised_equipe_ids())
      ))
  or (public.current_role() = 'vm' and exists (
        select 1 from public.fusions_secteurs fs where fs.actif and clients.potentiel = any(fs.potentiels)
      ))
  or (public.current_role() = 'vm' and exists (
        select 1 from public.programmes_hebdomadaires ph
        where ph.vm_id = auth.uid() and ph.statut = 'BROUILLON'
          and public.derogation_planning_active(ph.vm_id, ph.semaine_debut, 'ZONE')
      ))
);

-- Le contrôle serveur applique les dérogations à la ligne programmée, et maintient
-- le contrôle strict du portefeuille pour les programmes « pharmacies uniquement ».
create or replace function public.trg_programme_lignes_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prog record;
  cl record;
  is_fusion boolean;
  in_portefeuille boolean;
  nb_moyen_deroge int;
  max_moyen_deroge int;
  derog_zone boolean;
  derog_potentiel boolean;
begin
  select * into prog from public.programmes_hebdomadaires where id = new.programme_id;
  if prog is null then raise exception 'Programme hebdomadaire introuvable'; end if;
  if prog.statut <> 'BROUILLON' then
    raise exception 'Le programme est au statut % : ses lignes ne peuvent plus être modifiées', prog.statut;
  end if;

  select * into cl from public.clients where id = new.client_id;
  if cl is null then raise exception 'Client introuvable'; end if;
  if not cl.actif then raise exception 'Client % désactivé, non programmable', cl.nom; end if;

  select exists (
    select 1 from public.portefeuille where client_id = new.client_id and vm_id = prog.vm_id
  ) into in_portefeuille;

  derog_zone := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'ZONE');
  derog_potentiel := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'POTENTIEL');

  if not in_portefeuille and (not derog_zone or prog.mode_pharmacie_uniquement) then
    raise exception 'Le client "%" ne fait pas partie du portefeuille de ce VM', cl.nom;
  end if;

  if prog.mode_pharmacie_uniquement and new.type_visite <> 'PHARMACIE' then
    raise exception 'Semaine en mode "pharmacie uniquement" : seules les pharmacies sont programmables';
  end if;
  if new.type_visite = 'MEDICAL' and cl.specialite = 'PHARMACIE' then
    raise exception 'Type de visite incorrect : une pharmacie doit être ajoutée comme visite PHARMACIE';
  end if;
  if new.type_visite = 'PHARMACIE' and cl.specialite <> 'PHARMACIE' then
    raise exception 'Type de visite incorrect : seuls les clients pharmacie peuvent être ajoutés comme visite PHARMACIE';
  end if;

  -- Le mode pharmacie et la dérogation de potentiel lèvent les quotas de potentiel.
  if not prog.mode_pharmacie_uniquement and not derog_potentiel then
    if new.type_visite = 'MEDICAL' and cl.potentiel = 'MOYEN' and new.jour in ('LUNDI', 'MARDI', 'MERCREDI') then
      max_moyen_deroge := public.parametre_numeric('nb_max_moyen_lun_mar_mer_jour', 3)::int;
      select count(*) into nb_moyen_deroge
      from public.programme_lignes pl
      join public.clients c2 on c2.id = pl.client_id
      where pl.programme_id = new.programme_id and pl.jour = new.jour
        and pl.type_visite = 'MEDICAL' and c2.potentiel = 'MOYEN'
        and pl.id is distinct from new.id;
      if nb_moyen_deroge >= max_moyen_deroge then
        raise exception 'Dérogation "médecins moyens" épuisée le % : maximum % par jour', new.jour, max_moyen_deroge;
      end if;
    elsif not public.potentiel_autorise(new.jour, cl.potentiel) then
      raise exception 'Hiérarchisation non respectée : "%" (potentiel %) n''est pas autorisé le %', cl.nom, cl.potentiel, new.jour;
    end if;
  end if;

  if exists (
    select 1 from public.programme_lignes
    where programme_id = new.programme_id and client_id = new.client_id and id is distinct from new.id
  ) and not exists (
    select 1 from public.derogations_doublon_client
    where programme_id = new.programme_id and client_id = new.client_id
  ) then
    raise exception 'Le client "%" est déjà programmé cette semaine (dérogation administrateur requise pour un doublon)', cl.nom;
  end if;

  return new;
end;
$$;


-- Une dérogation de zone explicite autorise aussi la soumission du programme sans
-- bloquer sur les contrôles de secteur hérités.
create or replace function public.guard_secteur_soumission_programme()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.statut is distinct from old.statut
     and new.statut = 'VALIDE'::public.statut_programme
     and public.is_admin() then
    return new;
  end if;

  if new.statut is distinct from old.statut
     and new.statut in ('SOUMIS'::public.statut_programme, 'VALIDE'::public.statut_programme) then
    if new.secteur is null
       and not public.derogation_planning_active(new.vm_id, new.semaine_debut, 'ZONE') then
      raise exception 'Impossible de soumettre un programme sans secteur défini.';
    end if;

    if new.vm_id <> '2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f'::uuid
       and not public.is_fawaz_vm(new.vm_id)
       and new.vm_id <> '96388406-e88e-4146-a372-1df07481c8e4'::uuid
       and not public.derogation_planning_active(new.vm_id, new.semaine_debut, 'ZONE')
       and exists (
        select 1 from public.programme_lignes pl
        join public.clients c on c.id = pl.client_id
        where pl.programme_id = new.id
          and not exists (
            select 1 from public.programme_jours_validation pjv
            where pjv.programme_id = pl.programme_id
              and pjv.jour = pl.jour
              and pjv.statut = 'VALIDE'
          )
          and not public.fusion_active(new.semaine_debut, c.potentiel)
          and c.secteur is distinct from new.secteur
       ) then
      raise exception 'Programme non conforme au secteur % : une dérogation de zone est nécessaire pour cette semaine.', new.secteur;
    end if;
  end if;
  return new;
end;
$function$;

-- Le mode pharmacie et la dérogation de potentiel ne doivent pas être bloqués
-- par le contrôle de proportion des faibles potentiels du jeudi à la soumission.
do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.soumettre_programme_hebdomadaire(uuid)'::regprocedure)
    into v_definition;
  v_updated := replace(
    v_definition,
    'if nb_jeudi_total > 0 then',
    'if nb_jeudi_total > 0 and not prog.mode_pharmacie_uniquement and not public.derogation_planning_active(prog.vm_id, prog.semaine_debut, ''POTENTIEL'') then'
  );
  if v_updated = v_definition then
    raise exception 'Patch de soumission non appliqué : le contrôle du ratio jeudi a changé de forme.';
  end if;
  execute v_updated;
end;
$$;
