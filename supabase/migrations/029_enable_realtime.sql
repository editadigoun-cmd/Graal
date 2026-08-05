-- Aucune table n'était ajoutée à la publication supabase_realtime, alors que plusieurs
-- écrans s'abonnent à des postgres_changes (badge de notifications, dashboard VM,
-- messagerie, et l'écran Programmes) — ces abonnements ne recevaient donc jamais rien,
-- silencieusement.
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.visites;
alter publication supabase_realtime add table public.programmes_hebdomadaires;
alter publication supabase_realtime add table public.messages;
