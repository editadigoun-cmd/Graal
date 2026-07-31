-- 014: tâches planifiées (clôture forcée, verrouillage hebdomadaire)
-- Bénin = UTC+1 fixe (pas de changement d'heure) : 20h00 Bénin = 19h00 UTC, minuit lundi Bénin = 23h00 UTC dimanche.

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'graal-cloture-forcee',
  '0 19 * * 1-5',
  $$select public.forcer_clotures_du_jour();$$
);

select cron.schedule(
  'graal-verrou-programmes-semaine',
  '5 23 * * 0',
  $$select public.verrouiller_programmes_semaine();$$
);

select cron.schedule(
  'graal-alerte-frequence-clients',
  '0 6 * * 1',
  $$select public.signaler_non_respect_frequence();$$
);
