-- Internal configuration readers and scheduled maintenance jobs must not be callable by app users.
REVOKE EXECUTE ON FUNCTION public.__get_daily_config() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.__get_push_config() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.alterner_secteurs_vm_hebdomadaire() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.envoyer_rappels_appels() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.envoyer_rapports_hebdomadaires_visites() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.envoyer_rapports_visites_non_effectuees() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.forcer_clotures_du_jour() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.forcer_clotures_du_jour_complet() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notifier_anniversaires() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rappel_cloture_journee() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rappel_cloture_journee_parametre() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rappel_soumission_programme() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rappel_soumission_programme_parametre() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.signaler_non_conformite_journaliere() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.signaler_non_respect_frequence() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verifier_enregistrements_appels() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verrouiller_programmes_semaine() FROM authenticated;
