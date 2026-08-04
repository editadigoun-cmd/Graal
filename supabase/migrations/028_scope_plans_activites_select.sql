-- Le SELECT sur plans_activites_mensuels était ouvert à tout authentifié (using(true)),
-- alors que INSERT/UPDATE sont déjà scopés à l'équipe supervisée. Un superviseur pouvait
-- lire les plans de toutes les équipes, pas seulement la sienne (audit, point mineur).
drop policy plans_activites_select on public.plans_activites_mensuels;

create policy plans_activites_select on public.plans_activites_mensuels for select to authenticated using (
  public.is_admin()
  or (public.is_superviseur() and equipe_id in (select public.supervised_equipe_ids()))
);
