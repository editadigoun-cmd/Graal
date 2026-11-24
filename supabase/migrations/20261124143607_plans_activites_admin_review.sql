alter table public.plans_activites_mensuels
  add column if not exists statut text not null default 'SOUMIS',
  add column if not exists motif_rejet text,
  add column if not exists valide_at timestamptz,
  add column if not exists valide_par uuid references public.profiles(id);

alter table public.plans_activites_mensuels
  drop constraint if exists plans_activites_mensuels_statut_check;
alter table public.plans_activites_mensuels
  add constraint plans_activites_mensuels_statut_check
  check (statut in ('BROUILLON', 'SOUMIS', 'VALIDE', 'REFUSE'));

alter table public.plans_activites_mensuels
  drop constraint if exists plans_activites_mensuels_motif_rejet_check;
alter table public.plans_activites_mensuels
  add constraint plans_activites_mensuels_motif_rejet_check
  check (statut <> 'REFUSE' or nullif(btrim(motif_rejet), '') is not null);

drop policy if exists plans_activites_insert on public.plans_activites_mensuels;
create policy plans_activites_insert
on public.plans_activites_mensuels
for insert
to authenticated
with check (
  is_superviseur()
  and superviseur_id = (select auth.uid())
  and equipe_id in (select supervised_equipe_ids())
  and statut = 'SOUMIS'
);

drop policy if exists plans_activites_update on public.plans_activites_mensuels;
create policy plans_activites_update_superviseur
on public.plans_activites_mensuels
for update
to authenticated
using (
  is_superviseur()
  and superviseur_id = (select auth.uid())
  and statut in ('BROUILLON', 'REFUSE')
  and equipe_id in (select supervised_equipe_ids())
)
with check (
  is_superviseur()
  and superviseur_id = (select auth.uid())
  and statut = 'SOUMIS'
  and equipe_id in (select supervised_equipe_ids())
);

create policy plans_activites_update_admin
on public.plans_activites_mensuels
for update
to authenticated
using (is_admin())
with check (is_admin());

create index if not exists plans_activites_mensuels_statut_mois_idx
on public.plans_activites_mensuels (statut, mois desc);
