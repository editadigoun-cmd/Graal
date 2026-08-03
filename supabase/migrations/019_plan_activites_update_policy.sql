-- 019: le plan d'activités mensuel n'avait qu'une policy insert — impossible de compléter
-- un plan initial (ex: placeholder créé en attendant la vraie saisie) sans policy update.

create policy plans_activites_update on public.plans_activites_mensuels for update to authenticated
  using (
    (public.is_superviseur() and equipe_id in (select public.supervised_equipe_ids()))
    or public.is_admin()
  )
  with check (
    (public.is_superviseur() and equipe_id in (select public.supervised_equipe_ids()))
    or public.is_admin()
  );
