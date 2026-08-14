-- Piste si l'enregistrement cloud était réellement actif pour un appel donné (dépend du
-- palier Daily.co au moment de la création de la salle — voir create-daily-room), pour
-- afficher un message honnête côté "Enregistrements" plutôt qu'un faux "en attente" éternel.
alter table public.appels_programmes add column if not exists recording_actif boolean;
