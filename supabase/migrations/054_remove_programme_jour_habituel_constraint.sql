-- 054: le jour habituel renseigné sur la fiche client est indicatif.
-- Il ne doit pas empêcher un VM de programmer une visite un autre jour.
drop trigger if exists programme_lignes_habitual_day on public.programme_lignes;
