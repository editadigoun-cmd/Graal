-- 051: quotas_cibles / cible_specialite_map deviennent propres à chaque équipe (même schéma
-- que poids_specialite_visite, 048) — le client a communiqué des cibles hebdomadaires
-- différentes pour PROPHADIS, avec en plus une cible "Cardiologues" isolée des "Autres
-- spécialités" (jusqu'ici regroupées ensemble). TIL et ODYPAHARM conservent exactement les
-- valeurs globales actuelles, dupliquées telles quelles.
--
-- Cibles hebdomadaires PROPHADIS communiquées par le client :
--   Gynécologues 15, Généralistes 25, Pédiatres 5, Maternités 10, Dispensaires 10,
--   Cardiologues 5, Autres spécialités 5, Pharmacies 15.

alter table public.quotas_cibles add column equipe_id uuid references public.equipes(id) on delete cascade;
alter table public.cible_specialite_map add column equipe_id uuid references public.equipes(id) on delete cascade;

-- Retire les anciennes contraintes (PK sur "cible" seul) AVANT de dupliquer les lignes par
-- équipe, sinon la duplication viole l'unicité de l'ancienne PK.
alter table public.cible_specialite_map drop constraint cible_specialite_map_cible_fkey;
alter table public.cible_specialite_map drop constraint cible_specialite_map_pkey;
alter table public.quotas_cibles drop constraint quotas_cibles_pkey;

-- Duplique les lignes globales actuelles vers chaque équipe existante.
insert into public.quotas_cibles (equipe_id, cible, libelle, quota_hebdomadaire, ordre)
select e.id, qc.cible, qc.libelle, qc.quota_hebdomadaire, qc.ordre
from public.quotas_cibles qc cross join public.equipes e;

insert into public.cible_specialite_map (equipe_id, cible, specialite)
select e.id, csm.cible, csm.specialite
from public.cible_specialite_map csm cross join public.equipes e;

-- Retire les anciennes lignes globales (equipe_id encore null) avant de rendre la colonne obligatoire.
delete from public.cible_specialite_map where equipe_id is null;
delete from public.quotas_cibles where equipe_id is null;

alter table public.quotas_cibles alter column equipe_id set not null;
alter table public.cible_specialite_map alter column equipe_id set not null;

alter table public.quotas_cibles add primary key (equipe_id, cible);
alter table public.cible_specialite_map add primary key (equipe_id, cible, specialite);
alter table public.cible_specialite_map add constraint cible_specialite_map_cible_fkey
  foreign key (equipe_id, cible) references public.quotas_cibles(equipe_id, cible) on delete cascade;

-- Cibles PROPHADIS.
update public.quotas_cibles set quota_hebdomadaire = 25
  where cible = 'MEDECINS_GENERALISTES' and equipe_id = (select id from public.equipes where nom = 'PROPHADIS');
update public.quotas_cibles set quota_hebdomadaire = 5
  where cible = 'PEDIATRES' and equipe_id = (select id from public.equipes where nom = 'PROPHADIS');
update public.quotas_cibles set quota_hebdomadaire = 5
  where cible = 'AUTRES_SPECIALITES' and equipe_id = (select id from public.equipes where nom = 'PROPHADIS');
-- GYNECOLOGUES (15), MATERNITES (10), DISPENSAIRES (10), PHARMACIES (15) : déjà les bonnes valeurs.

-- Cardiologues isolés des "Autres spécialités" pour PROPHADIS uniquement (TIL/ODYPAHARM restent groupés).
insert into public.quotas_cibles (equipe_id, cible, libelle, quota_hebdomadaire, ordre)
values ((select id from public.equipes where nom = 'PROPHADIS'), 'CARDIOLOGUES', 'Cardiologues', 5, 8);

update public.cible_specialite_map set cible = 'CARDIOLOGUES'
  where specialite = 'CARDIOLOGUE' and equipe_id = (select id from public.equipes where nom = 'PROPHADIS');

-- ============================================================
-- cible_pour_specialite() : devient scopée par équipe. La vue en dépend, donc on la retire
-- avant de changer la signature de la fonction puis on la recrée juste après.
-- ============================================================
drop view if exists public.v_taux_realisation_hebdomadaire;
drop function if exists public.cible_pour_specialite(specialite_client);

create or replace function public.cible_pour_specialite(p_equipe_id uuid, p_specialite specialite_client)
returns text language sql stable set search_path = public as $$
  select cible from public.cible_specialite_map where equipe_id = p_equipe_id and specialite = p_specialite limit 1;
$$;

-- ============================================================
-- v_taux_realisation_hebdomadaire : cible calculée via l'équipe du VM.
-- ============================================================
create or replace view public.v_taux_realisation_hebdomadaire as
select l.vm_id, l.semaine_debut,
  public.cible_pour_specialite(p.equipe_id, l.specialite) as cible,
  count(*) as prevues,
  count(*) filter (where l.statut_reel = 'REALISEE') as realisees,
  round(count(*) filter (where l.statut_reel = 'REALISEE')::numeric / nullif(count(*), 0), 4) as taux
from public.v_lignes_avec_statut l
join public.profiles p on p.id = l.vm_id
where l.programme_statut in ('VALIDE', 'VERROUILLE')
group by l.vm_id, l.semaine_debut, public.cible_pour_specialite(p.equipe_id, l.specialite);

-- La vue a été DROP puis recréée (dépendance de fonction ci-dessus) : le security_invoker
-- posé par 015_security_hardening.sql doit être réappliqué explicitement.
alter view public.v_taux_realisation_hebdomadaire set (security_invoker = true);

-- ============================================================
-- soumettre_programme_hebdomadaire() : le rapport de conformité utilise les quotas de
-- l'équipe du VM (au lieu des quotas globaux).
-- ============================================================
create or replace function public.soumettre_programme_hebdomadaire(p_programme_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  prog record;
  deadline timestamp;
  min_medical_jour int;
  min_pharmacie_jour int;
  poids_normal numeric;
  poids_reduit numeric;
  nb_jeudi_total int;
  nb_jeudi_faible int;
  seuil_faible numeric;
  ratio_faible numeric;
  v_equipe_id uuid;
  r record;
  rapport jsonb;
begin
  select * into prog from public.programmes_hebdomadaires where id = p_programme_id;
  if prog is null then
    raise exception 'Programme introuvable';
  end if;
  if prog.vm_id <> auth.uid() and not public.is_admin() then
    raise exception 'Action non autorisée';
  end if;
  if prog.statut <> 'BROUILLON' then
    raise exception 'Programme déjà soumis (statut %)', prog.statut;
  end if;

  deadline := (prog.semaine_debut - 4) + time '21:00';
  if prog.delai_supplementaire_jusqu_a is not null and prog.delai_supplementaire_jusqu_a > deadline then
    deadline := prog.delai_supplementaire_jusqu_a;
  end if;

  if public.benin_now() > deadline and not public.is_admin() then
    insert into public.notifications (profile_id, type, titre, corps, metadata)
    select id, 'SOUMISSION_HORS_DELAI', 'Tentative de soumission hors délai',
      format('%s a tenté de soumettre son programme de la semaine du %s après le délai (jeudi 21h, heure du Bénin).',
        coalesce((select full_name from public.profiles where id = prog.vm_id), 'Un VM'), prog.semaine_debut),
      jsonb_build_object('programme_id', prog.id, 'vm_id', prog.vm_id, 'tentative_a', public.benin_now())
    from public.profiles where role = 'admin';

    return jsonb_build_object(
      'statut', 'REJETE_HORS_DELAI',
      'message', 'Délai de soumission dépassé : le programme devait être soumis avant jeudi 21h00 (heure du Bénin)'
    );
  end if;

  if not exists (select 1 from public.programme_lignes where programme_id = p_programme_id) then
    raise exception 'Le programme est vide';
  end if;

  if not prog.mode_pharmacie_uniquement then
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
             count(*) filter (
               where pl.type_visite = 'MEDICAL' and cl.potentiel = 'MOYEN' and pl.jour in ('LUNDI', 'MARDI', 'MERCREDI')
             ) as nb_medical_moyen_reduit,
             count(*) filter (where pl.type_visite = 'PHARMACIE') as nb_pharmacie
      from public.programme_lignes pl
      join public.clients cl on cl.id = pl.client_id
      where pl.programme_id = p_programme_id
      group by pl.jour
    loop
      if (
        (r.nb_medical - r.nb_medical_moyen_reduit) * poids_normal + r.nb_medical_moyen_reduit * poids_reduit
      ) < 100 - 0.01 or r.nb_pharmacie < min_pharmacie_jour then
        raise exception 'Minimum non atteint le % : % pourcent de programmation médicale pondérée (minimum 100%%, dont % médecin(s) "moyen" à poids réduit), % pharmacies (minimum %)',
          r.jour,
          round(((r.nb_medical - r.nb_medical_moyen_reduit) * poids_normal + r.nb_medical_moyen_reduit * poids_reduit)::numeric, 1),
          r.nb_medical_moyen_reduit, r.nb_pharmacie, min_pharmacie_jour;
      end if;
    end loop;
  end if;

  select count(*) filter (where cl.potentiel = 'FAIBLE'), count(*)
    into nb_jeudi_faible, nb_jeudi_total
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
    where pl.programme_id = p_programme_id and pl.jour = 'JEUDI';

  seuil_faible := public.parametre_numeric('seuil_faible_jeudi_pourcentage_max', 50) / 100.0;

  if nb_jeudi_total > 0 then
    ratio_faible := nb_jeudi_faible::numeric / nb_jeudi_total;
    if ratio_faible > seuil_faible then
      raise exception 'Part de clients FAIBLE le jeudi trop élevée : %s%% programmés (maximum autorisé %s%%)',
        round(ratio_faible * 100), round(seuil_faible * 100);
    end if;
  end if;

  select equipe_id into v_equipe_id from public.profiles where id = prog.vm_id;

  delete from public.programme_conformite where programme_id = p_programme_id;
  insert into public.programme_conformite (programme_id, cible, quota_attendu, quantite_programmee, statut)
  select p_programme_id, qc.cible, qc.quota_hebdomadaire, coalesce(cnt.n, 0),
    case
      when coalesce(cnt.n, 0) = qc.quota_hebdomadaire then 'CONFORME'
      when coalesce(cnt.n, 0) < qc.quota_hebdomadaire then 'SOUS_COUVERT'
      else 'SUR_COUVERT'
    end
  from public.quotas_cibles qc
  left join (
    select public.cible_pour_specialite(v_equipe_id, cl.specialite) as cible, count(*) as n
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
    where pl.programme_id = p_programme_id
    group by 1
  ) cnt on cnt.cible = qc.cible
  where qc.equipe_id = v_equipe_id;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
    set statut = 'SOUMIS', soumis_at = now()
    where id = p_programme_id;

  select jsonb_agg(to_jsonb(pc) - 'id' - 'programme_id') into rapport
    from public.programme_conformite pc where programme_id = p_programme_id;

  return jsonb_build_object('statut', 'SOUMIS', 'conformite', coalesce(rapport, '[]'::jsonb));
end;
$$;
