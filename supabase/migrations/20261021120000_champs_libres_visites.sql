-- Champs de compte rendu libre pour les visites médicales et pharmacies.
-- Les produits présentés restent sélectionnés dans le catalogue et enregistrés dans visite_produits.
alter table public.visites
  add column if not exists cachets_obtenus text,
  add column if not exists engagements_prescription text,
  add column if not exists produits_habituels_prescription text,
  add column if not exists constats_prescription text,
  add column if not exists resume_visite text,
  add column if not exists stock_observe text;
