-- 015: durcissement sécurité suite aux avis de l'advisor Supabase
-- 1) Les vues doivent respecter les RLS de l'utilisateur appelant (security_invoker),
--    sinon elles s'exécutent avec les droits du propriétaire (postgres) et contournent
--    tout le cloisonnement par rôle/secteur/équipe construit dans 011_row_level_security.sql.
-- 2) search_path figé sur toutes les fonctions (anti hijacking).
-- 3) Les fonctions internes (cron, triggers auth) ne doivent pas être appelables via l'API REST.

alter view public.v_lignes_avec_statut set (security_invoker = true);
alter view public.v_taux_realisation_journalier set (security_invoker = true);
alter view public.v_taux_realisation_hebdomadaire set (security_invoker = true);
alter view public.v_hors_programme_journalier set (security_invoker = true);
alter view public.v_score_couverture_vm set (security_invoker = true);
alter view public.v_client_frequence set (security_invoker = true);

alter function public.plan_active_equipe_mois(uuid, date) set search_path = public;
alter function public.trg_reporting_guard_visa() set search_path = public;
alter function public.points_potentiel(potentiel_client) set search_path = public;
alter function public.get_parametre(text) set search_path = public;
alter function public.cible_pour_specialite(specialite_client) set search_path = public;
alter function public.score_mensuel_vm(uuid, date) set search_path = public;
alter function public.jour_offset(jour_semaine) set search_path = public;
alter function public.potentiel_autorise(jour_semaine, potentiel_client) set search_path = public;
alter function public.parametre_text(text, text) set search_path = public;
alter function public.parametre_numeric(text, numeric) set search_path = public;
alter function public.trg_programmes_guard_statut() set search_path = public;
alter function public.trg_clotures_guard() set search_path = public;
alter function public.trg_profiles_guard_role() set search_path = public;
alter function public.trg_programmes_check_plan() set search_path = public;
alter function public.trg_programme_lignes_validate() set search_path = public;
alter function public.default_frequence(potentiel_client) set search_path = public;
alter function public.clients_apply_default_frequence() set search_path = public;
alter function public.portefeuille_check_secteur() set search_path = public;
alter function public.trg_visites_validate() set search_path = public;
alter function public.trg_visites_guard_immutable() set search_path = public;
alter function public.fusion_active(date, potentiel_client) set search_path = public;
alter function public.benin_now() set search_path = public;
alter function public.benin_today() set search_path = public;
alter function public.jour_semaine_benin(date) set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.trg_manquante_motifs_validate() set search_path = public;
alter function public.trg_plan_activites_validate() set search_path = public;
alter function public.trg_programmes_guard_mode_pharmacie() set search_path = public;

-- Fonctions strictement internes (déclenchées par pg_cron ou par un trigger sur auth.users) :
-- aucun rôle HTTP ne doit pouvoir les invoquer via /rest/v1/rpc/...
revoke execute on function public.forcer_clotures_du_jour() from anon, authenticated;
revoke execute on function public.verrouiller_programmes_semaine() from anon, authenticated;
revoke execute on function public.signaler_non_respect_frequence() from anon, authenticated;
revoke execute on function public.handle_new_auth_user() from anon, authenticated;

-- Les RPC métier restent appelables par les utilisateurs connectés uniquement (jamais anon) ;
-- chacune vérifie déjà en interne le rôle et la propriété de la ressource.
revoke execute on function public.cloturer_journee(text, double precision, double precision) from anon;
revoke execute on function public.soumettre_programme_hebdomadaire(uuid) from anon;
revoke execute on function public.valider_programme_hebdomadaire(uuid) from anon;
revoke execute on function public.rejeter_programme_hebdomadaire(uuid, text) from anon;
revoke execute on function public.definir_mode_pharmacie_uniquement(uuid, boolean) from anon;
revoke execute on function public.definir_fusion_secteurs(date, potentiel_client[], boolean) from anon;
revoke execute on function public.current_role() from anon;
revoke execute on function public.current_secteur() from anon;
revoke execute on function public.current_equipe() from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_superviseur() from anon;
revoke execute on function public.is_vm_in_my_scope(uuid) from anon;
revoke execute on function public.supervised_equipe_ids() from anon;
