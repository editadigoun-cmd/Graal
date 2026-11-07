-- Individual VM overrides for weekly specialty targets and specialty weights.
create table if not exists public.vm_quotas_cibles (
  vm_id uuid not null references public.profiles(id) on delete cascade,
  cible text not null,
  libelle text not null,
  quota_hebdomadaire integer not null default 0 check (quota_hebdomadaire >= 0),
  ordre integer not null default 0,
  primary key (vm_id, cible)
);
create table if not exists public.vm_poids_specialite_visite (
  vm_id uuid not null references public.profiles(id) on delete cascade,
  specialite public.specialite_client not null,
  poids numeric not null default 1 check (poids >= 0),
  primary key (vm_id, specialite)
);
alter table public.vm_quotas_cibles enable row level security;
alter table public.vm_poids_specialite_visite enable row level security;
drop policy if exists vm_quotas_select on public.vm_quotas_cibles;
create policy vm_quotas_select on public.vm_quotas_cibles for select using (true);
drop policy if exists vm_quotas_write on public.vm_quotas_cibles;
create policy vm_quotas_write on public.vm_quotas_cibles for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists vm_poids_select on public.vm_poids_specialite_visite;
create policy vm_poids_select on public.vm_poids_specialite_visite for select using (true);
drop policy if exists vm_poids_write on public.vm_poids_specialite_visite;
create policy vm_poids_write on public.vm_poids_specialite_visite for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.poids_specialite_vm(p_vm_id uuid, p_specialite public.specialite_client)
returns numeric language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select poids from public.vm_poids_specialite_visite where vm_id = p_vm_id and specialite = p_specialite),
    (select public.poids_specialite(pr.equipe_id, p_specialite) from public.profiles pr where pr.id = p_vm_id),
    1
  );
$$;

create or replace function public.soumettre_programme_hebdomadaire(p_programme_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  prog record; deadline timestamptz; deadline_hour text;
  min_medical_jour int; min_pharmacie_jour int; poids_normal numeric; poids_reduit numeric;
  v_equipe_id uuid; r record; rapport jsonb;
begin
  select * into prog from public.programmes_hebdomadaires where id = p_programme_id;
  if prog is null then raise exception 'Programme introuvable'; end if;
  if prog.vm_id <> auth.uid() and not public.is_admin() then raise exception 'Action non autorisée'; end if;
  if prog.statut <> 'BROUILLON' then raise exception 'Programme déjà soumis (statut %)', prog.statut; end if;

  deadline_hour := coalesce(public.parametre_text('heure_limite_soumission_programme', '14:00'), '14:00');
  deadline := (((prog.semaine_debut - 2) + deadline_hour::time)::timestamp at time zone 'Africa/Porto-Novo');
  if prog.delai_supplementaire_jusqu_a is not null and prog.delai_supplementaire_jusqu_a > deadline then deadline := prog.delai_supplementaire_jusqu_a; end if;
  if now() > deadline and not public.is_admin() then
    insert into public.notifications (profile_id, type, titre, corps, metadata)
    select id, 'SOUMISSION_HORS_DELAI', 'Tentative de soumission hors délai',
      format('%s a tenté de soumettre son programme de la semaine du %s après le délai (samedi %s, heure du Bénin).',
        coalesce((select full_name from public.profiles where id = prog.vm_id), 'Un VM'), prog.semaine_debut, deadline_hour),
      jsonb_build_object('programme_id', prog.id, 'vm_id', prog.vm_id, 'tentative_a', public.benin_now())
    from public.profiles where role = 'admin';
    return jsonb_build_object('statut', 'REJETE_HORS_DELAI',
      'message', format('Délai de soumission dépassé : le programme devait être soumis avant samedi %s (heure du Bénin)', deadline_hour));
  end if;

  if not exists (select 1 from public.programme_lignes where programme_id = p_programme_id) then raise exception 'Le programme est vide'; end if;
  if exists (select 1 from public.programme_lignes where programme_id = p_programme_id group by jour having count(*) > public.parametre_numeric('max_visites_jour', 22)::int) then
    raise exception 'Limite quotidienne dépassée : un VM ne peut pas programmer plus de 22 visites par jour';
  end if;

  if not prog.mode_pharmacie_uniquement and prog.vm_id not in ('e86efe52-ed01-4d04-8eec-e539fd1e4b30'::uuid, 'bb2519e6-04d8-4740-b878-a0b999ad7606'::uuid) then
    min_medical_jour := public.parametre_numeric('visites_minimum_medical_jour', 15);
    min_pharmacie_jour := public.parametre_numeric('visites_minimum_pharmacie_jour', 3);
    poids_normal := case when min_medical_jour > 0 then 100.0 / min_medical_jour else 0 end;
    poids_reduit := public.parametre_numeric('poids_visite_moyen_reduit_pourcentage', 2.5);
    if (select count(distinct jour) from public.programme_lignes where programme_id = p_programme_id) < 5 then
      raise exception 'Le programme doit couvrir les 5 jours de la semaine (Lundi à Vendredi)';
    end if;
    for r in
      select pl.jour,
        count(*) filter (where pl.type_visite = 'MEDICAL') as nb_medical,
        count(*) filter (where pl.type_visite = 'MEDICAL' and cl.potentiel = 'MOYEN' and pl.jour in ('LUNDI', 'MARDI', 'MERCREDI')) as nb_medical_moyen_reduit,
        count(*) filter (where pl.type_visite = 'PHARMACIE') as nb_pharmacie
      from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
      where pl.programme_id = p_programme_id group by pl.jour
    loop
      if ((r.nb_medical - r.nb_medical_moyen_reduit) * poids_normal + r.nb_medical_moyen_reduit * poids_reduit) < 100 - 0.01
         or (not public.is_fawaz_vm(prog.vm_id) and r.nb_pharmacie < min_pharmacie_jour) then
        raise exception 'Minimum non atteint le % : % pourcent de programmation médicale pondérée, % pharmacies (minimum %)',
          r.jour, round(((r.nb_medical - r.nb_medical_moyen_reduit) * poids_normal + r.nb_medical_moyen_reduit * poids_reduit)::numeric, 1),
          r.nb_pharmacie, min_pharmacie_jour;
      end if;
    end loop;
  end if;

  select equipe_id into v_equipe_id from public.profiles where id = prog.vm_id;
  delete from public.programme_conformite where programme_id = p_programme_id;
  insert into public.programme_conformite (programme_id, cible, quota_attendu, quantite_programmee, statut)
  select p_programme_id, qc.cible, qc.quota_hebdomadaire, coalesce(cnt.n, 0),
    case when coalesce(cnt.n, 0) = qc.quota_hebdomadaire then 'CONFORME'
         when coalesce(cnt.n, 0) < qc.quota_hebdomadaire then 'SOUS_COUVERT' else 'SUR_COUVERT' end
  from (
    select cible, quota_hebdomadaire from public.vm_quotas_cibles where vm_id = prog.vm_id
    union all
    select q.cible, q.quota_hebdomadaire from public.quotas_cibles q
    where q.equipe_id = v_equipe_id
      and not exists (select 1 from public.vm_quotas_cibles vq where vq.vm_id = prog.vm_id)
  ) qc
  left join (
    select public.cible_pour_specialite(v_equipe_id, cl.specialite) as cible, count(*) as n
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
    where pl.programme_id = p_programme_id group by 1
  ) cnt on cnt.cible = qc.cible;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires set statut = 'SOUMIS', soumis_at = now() where id = p_programme_id;
  select jsonb_agg(to_jsonb(pc) - 'id' - 'programme_id') into rapport from public.programme_conformite pc where programme_id = p_programme_id;
  return jsonb_build_object('statut', 'SOUMIS', 'conformite', coalesce(rapport, '[]'::jsonb));
end;
$function$;
