-- 048: pondération du score de couverture par spécialité, propre à chaque équipe — demande
-- explicite du client pour l'équipe PROPHADIS.
--
-- Jusqu'ici le "score de couverture" (v_score_couverture_vm) et le taux de réalisation
-- hebdomadaire (v_taux_realisation_hebdomadaire) ne pondéraient les visites médicales que par
-- potentiel client (GROS/MOYEN/FAIBLE), jamais par spécialité : un généraliste et un
-- gynécologue comptaient pareil. Le client veut désormais qu'une hiérarchie de spécialités
-- pèse directement sur le score hebdomadaire d'un délégué, pour l'équipe PROPHADIS :
--   1. Gynécologues       — cible prioritaire, score fort (délégués qui s'en éloignent)
--   2. Généralistes       — cible importante, légèrement en dessous
--   3. Dispensaires/Maternités — importants mais nombreux/faciles, légèrement en dessous
--   4. Pédiatres          — légèrement en dessous
--   5. Autres spécialités — le plus bas
-- Table par équipe (comme produits_par_equipe, 037) pour ne rien changer aux autres équipes
-- (TIL, ODYPAHARM) : poids neutre (1) partout ailleurs, jusqu'à une éventuelle demande similaire.

create table public.poids_specialite_visite (
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  specialite specialite_client not null,
  poids numeric(5,2) not null default 1,
  primary key (equipe_id, specialite)
);

alter table public.poids_specialite_visite enable row level security;

create policy poids_specialite_select on public.poids_specialite_visite for select to authenticated using (true);
create policy poids_specialite_write on public.poids_specialite_visite for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Poids neutre par défaut pour toutes les équipes existantes (aucun changement de comportement
-- pour TIL/ODYPAHARM tant que le client ne demande pas la même hiérarchisation pour elles).
insert into public.poids_specialite_visite (equipe_id, specialite, poids)
select e.id, s.specialite, 1
from public.equipes e
cross join (select unnest(enum_range(null::specialite_client)) as specialite) s
on conflict (equipe_id, specialite) do nothing;

-- Hiérarchie demandée pour PROPHADIS.
update public.poids_specialite_visite set poids = 5
  where specialite = 'GYNECOLOGUE' and equipe_id = (select id from public.equipes where nom = 'PROPHADIS');
update public.poids_specialite_visite set poids = 3.5
  where specialite = 'GENERALISTE' and equipe_id = (select id from public.equipes where nom = 'PROPHADIS');
update public.poids_specialite_visite set poids = 3
  where specialite in ('DISPENSAIRE', 'MATERNITE') and equipe_id = (select id from public.equipes where nom = 'PROPHADIS');
update public.poids_specialite_visite set poids = 2.5
  where specialite = 'PEDIATRE' and equipe_id = (select id from public.equipes where nom = 'PROPHADIS');
update public.poids_specialite_visite set poids = 2
  where specialite in ('CARDIOLOGUE', 'RHUMATOLOGUE', 'ORL', 'AUTRE_SPECIALITE')
    and equipe_id = (select id from public.equipes where nom = 'PROPHADIS');
-- PHARMACIE reste à poids neutre (1) : hors-sujet, les pharmacies suivent leur propre quota.

create or replace function public.poids_specialite(p_equipe_id uuid, p_specialite specialite_client)
returns numeric language sql stable set search_path = public as $$
  select coalesce(
    (select poids from public.poids_specialite_visite where equipe_id = p_equipe_id and specialite = p_specialite),
    1
  );
$$;

-- Score hebdomadaire pondéré par spécialité (visites médicales uniquement) : un délégué qui
-- rate ses gynécologues dans la semaine voit ce score chuter bien plus qu'en ratant des
-- "autres spécialités", puisque le poids manqué pèse davantage sur le total attendu.
create or replace view public.v_score_hebdomadaire_pondere as
select
  l.vm_id,
  l.semaine_debut,
  sum(public.poids_specialite(p.equipe_id, l.specialite)) as points_prevus,
  sum(public.poids_specialite(p.equipe_id, l.specialite)) filter (where l.statut_reel = 'REALISEE') as points_realises,
  round(
    100.0 * sum(public.poids_specialite(p.equipe_id, l.specialite)) filter (where l.statut_reel = 'REALISEE')
    / nullif(sum(public.poids_specialite(p.equipe_id, l.specialite)), 0),
    1
  ) as score_pondere_pourcentage
from public.v_lignes_avec_statut l
join public.profiles p on p.id = l.vm_id
where l.type_visite = 'MEDICAL' and l.programme_statut in ('VALIDE', 'VERROUILLE')
group by l.vm_id, l.semaine_debut;

alter view public.v_score_hebdomadaire_pondere set (security_invoker = true);

-- ============================================================
-- signaler_non_respect_frequence() : signale désormais aussi le VM concerné (pas seulement
-- son superviseur/l'admin), pour que le manquement lui soit visible immédiatement — demande
-- explicite du client ("signalé automatiquement à mon niveau et à son niveau").
-- ============================================================
create or replace function public.signaler_non_respect_frequence()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select distinct coalesce(se.superviseur_id, adm.id), 'FREQUENCE_NON_RESPECTEE',
    'Fréquence de visite non respectée',
    format('%s (%s) n''a pas été visité selon la fréquence attendue.', vf.nom, vf.potentiel),
    jsonb_build_object('client_id', vf.client_id, 'vm_id', vf.vm_id)
  from public.v_client_frequence vf
  join public.profiles p on p.id = vf.vm_id
  left join public.superviseur_equipes se on se.equipe_id = p.equipe_id
  left join public.profiles adm on adm.role = 'admin'
  where not vf.frequence_respectee and vf.vm_id is not null;

  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select distinct vf.vm_id, 'FREQUENCE_NON_RESPECTEE',
    'Client non visité selon la fréquence attendue',
    format('Vous n''avez pas visité "%s" (%s) selon la fréquence attendue ce mois-ci.', vf.nom, vf.potentiel),
    jsonb_build_object('client_id', vf.client_id, 'vm_id', vf.vm_id)
  from public.v_client_frequence vf
  where not vf.frequence_respectee and vf.vm_id is not null;
end;
$$;
