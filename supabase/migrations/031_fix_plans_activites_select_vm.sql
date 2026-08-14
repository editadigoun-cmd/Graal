-- La migration 028 a resserré le SELECT sur plans_activites_mensuels à admin/superviseur
-- uniquement, en oubliant le rôle VM. Or trg_programmes_check_plan() (via
-- plan_active_equipe_mois()) lit cette table avec les droits du VM lui-même au moment où
-- il crée son programme hebdomadaire (fonction SQL en invoker rights, pas security definer).
-- Résultat : la vérification voit toujours "aucun plan soumis" pour un VM, même quand un
-- plan existe bel et bien pour son équipe — tous les VM étaient bloqués en permanence sur
-- Planning depuis cette migration. Confirmé en reproduisant la requête sous RLS avec le rôle
-- authenticated et un vm_id réel : l'exception "Aucun plan d'activités mensuel soumis..."
-- se déclenche alors que la ligne existe bien pour l'équipe et le mois concernés.
drop policy plans_activites_select on public.plans_activites_mensuels;

create policy plans_activites_select on public.plans_activites_mensuels for select to authenticated using (
  public.is_admin()
  or (public.is_superviseur() and equipe_id in (select public.supervised_equipe_ids()))
  or equipe_id = (select equipe_id from public.profiles where id = auth.uid())
);
