-- 016: Postgres accorde EXECUTE à PUBLIC par défaut à la création d'une fonction.
-- Un REVOKE ciblé sur `anon`/`authenticated` seul ne suffit pas tant que le rôle PUBLIC
-- reste titulaire du droit (anon/authenticated en héritent). On révoque donc depuis PUBLIC,
-- puis on ne redonne EXECUTE qu'aux rôles réellement légitimes.

revoke execute on function public.forcer_clotures_du_jour() from public;
revoke execute on function public.verrouiller_programmes_semaine() from public;
revoke execute on function public.signaler_non_respect_frequence() from public;
revoke execute on function public.handle_new_auth_user() from public;

revoke execute on function public.cloturer_journee(text, double precision, double precision) from public;
grant execute on function public.cloturer_journee(text, double precision, double precision) to authenticated;

revoke execute on function public.soumettre_programme_hebdomadaire(uuid) from public;
grant execute on function public.soumettre_programme_hebdomadaire(uuid) to authenticated;

revoke execute on function public.valider_programme_hebdomadaire(uuid) from public;
grant execute on function public.valider_programme_hebdomadaire(uuid) to authenticated;

revoke execute on function public.rejeter_programme_hebdomadaire(uuid, text) from public;
grant execute on function public.rejeter_programme_hebdomadaire(uuid, text) to authenticated;

revoke execute on function public.definir_mode_pharmacie_uniquement(uuid, boolean) from public;
grant execute on function public.definir_mode_pharmacie_uniquement(uuid, boolean) to authenticated;

revoke execute on function public.definir_fusion_secteurs(date, potentiel_client[], boolean) from public;
grant execute on function public.definir_fusion_secteurs(date, potentiel_client[], boolean) to authenticated;

revoke execute on function public.current_role() from public;
grant execute on function public.current_role() to authenticated;

revoke execute on function public.current_secteur() from public;
grant execute on function public.current_secteur() to authenticated;

revoke execute on function public.current_equipe() from public;
grant execute on function public.current_equipe() to authenticated;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.is_superviseur() from public;
grant execute on function public.is_superviseur() to authenticated;

revoke execute on function public.is_vm_in_my_scope(uuid) from public;
grant execute on function public.is_vm_in_my_scope(uuid) to authenticated;

revoke execute on function public.supervised_equipe_ids() from public;
grant execute on function public.supervised_equipe_ids() to authenticated;
