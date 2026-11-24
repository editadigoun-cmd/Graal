alter table public.plans_activites_mensuels
  drop constraint if exists plans_activites_mensuels_statut_check;
alter table public.plans_activites_mensuels
  add constraint plans_activites_mensuels_statut_check
  check (statut in ('BROUILLON', 'SOUMIS', 'VALIDE', 'REFUSE', 'ARCHIVE'));

-- Les plans antérieurs au mois courant existaient avant le circuit de visa.
-- Ils sont conservés en historique et ne doivent pas apparaître comme des demandes en attente.
alter table public.plans_activites_mensuels disable trigger trg_plan_activite_deadline;
update public.plans_activites_mensuels
set statut = 'ARCHIVE', motif_rejet = null
where mois < date_trunc('month', timezone('Africa/Porto-Novo', now()))::date
  and statut = 'SOUMIS';
alter table public.plans_activites_mensuels enable trigger trg_plan_activite_deadline;
