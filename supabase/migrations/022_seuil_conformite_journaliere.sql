-- 022: le seuil de conformité journalière (paramètre déjà existant, jamais utilisé) est
-- maintenant réellement appliqué : la vue expose un verdict conforme/non-conforme par
-- jour/VM, et une alerte quotidienne est envoyée à la hiérarchie pour toute journée
-- sous le seuil (audit cahier des charges, point 3).

create or replace view public.v_taux_realisation_journalier as
select vm_id, date_visite as jour,
  count(*) as visites_prevues,
  count(*) filter (where statut_reel = 'REALISEE') as visites_realisees,
  round(count(*) filter (where statut_reel = 'REALISEE')::numeric / nullif(count(*), 0), 4) as taux_realisation,
  case when count(*) = 0 then null
    else (count(*) filter (where statut_reel = 'REALISEE')::numeric / count(*))
      >= (public.parametre_numeric('seuil_conformite_journaliere_pourcentage', 80) / 100.0)
  end as conforme
from public.v_lignes_avec_statut
where programme_statut in ('VALIDE', 'VERROUILLE')
group by vm_id, date_visite;

-- Signale aux superviseurs/admin toute journée VM passée sous le seuil de conformité.
create or replace function public.signaler_non_conformite_journaliere()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_jour date := public.benin_today();
begin
  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select distinct coalesce(se.superviseur_id, adm.id), 'JOURNEE_NON_CONFORME',
    'Journée sous le seuil de conformité',
    format('%s : %s%% de visites réalisées le %s (seuil requis : %s%%).',
      coalesce(p.full_name, 'Un VM'), round(t.taux_realisation * 100), to_char(t.jour, 'DD/MM/YYYY'),
      round(public.parametre_numeric('seuil_conformite_journaliere_pourcentage', 80))),
    jsonb_build_object('vm_id', t.vm_id, 'jour', t.jour, 'taux_realisation', t.taux_realisation)
  from public.v_taux_realisation_journalier t
  join public.profiles p on p.id = t.vm_id
  left join public.superviseur_equipes se on se.equipe_id = p.equipe_id
  left join public.profiles adm on adm.role = 'admin'
  where t.jour = v_jour and t.conforme is false;
end;
$$;

revoke execute on function public.signaler_non_conformite_journaliere() from public;

-- Vérifie la journée qui vient de se terminer (après la clôture forcée à 20h Bénin = 19h UTC).
select cron.schedule(
  'graal-alerte-conformite-journaliere',
  '30 19 * * 1-5',
  $$select public.signaler_non_conformite_journaliere();$$
);
