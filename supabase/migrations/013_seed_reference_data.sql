-- 013: données de référence (équipes, motifs, produits, quotas, paramètres par défaut)

insert into public.equipes (nom) values ('PROPHADIS'), ('TIL'), ('ODYPAHARM')
on conflict (nom) do nothing;

insert into public.motifs_non_visite (libelle, ordre) values
  ('Absent / fermé', 1),
  ('Reporté à la demande du client', 2),
  ('Client indisponible', 3),
  ('Problème de transport', 4),
  ('Urgence secteur', 5),
  ('Autre', 6),
  ('Non faite / non justifiée (clôture forcée)', 99)
on conflict (libelle) do nothing;

insert into public.produits (nom) values
  ('Produit générique A'), ('Produit générique B'), ('Produit générique C'),
  ('Gamme pédiatrie'), ('Gamme cardiologie'), ('Gamme gynécologie'),
  ('Antalgique'), ('Anti-inflammatoire'), ('Antibiotique'), ('Complément vitaminique')
on conflict (nom) do nothing;
-- Catalogue provisoire : à remplacer par la gamme réelle GRAAL (import ou saisie admin).

insert into public.quotas_cibles (cible, libelle, quota_hebdomadaire, ordre) values
  ('MEDECINS_GENERALISTES', 'Médecins généralistes', 20, 1),
  ('DISPENSAIRES', 'Dispensaires', 10, 2),
  ('MATERNITES', 'Maternités', 10, 3),
  ('PEDIATRES', 'Pédiatres', 10, 4),
  ('GYNECOLOGUES', 'Gynécologues', 15, 5),
  ('AUTRES_SPECIALITES', 'Autres spécialités', 10, 6),
  ('PHARMACIES', 'Pharmacies', 15, 7)
on conflict (cible) do nothing;

insert into public.cible_specialite_map (cible, specialite) values
  ('MEDECINS_GENERALISTES', 'GENERALISTE'),
  ('DISPENSAIRES', 'DISPENSAIRE'),
  ('MATERNITES', 'MATERNITE'),
  ('PEDIATRES', 'PEDIATRE'),
  ('GYNECOLOGUES', 'GYNECOLOGUE'),
  ('AUTRES_SPECIALITES', 'CARDIOLOGUE'),
  ('AUTRES_SPECIALITES', 'RHUMATOLOGUE'),
  ('AUTRES_SPECIALITES', 'ORL'),
  ('AUTRES_SPECIALITES', 'AUTRE_SPECIALITE'),
  ('PHARMACIES', 'PHARMACIE')
on conflict do nothing;

insert into public.parametres (key, value, description) values
  ('seuil_faible_jeudi_pourcentage_max', '50', 'Part maximale (%) de clients FAIBLE potentiel programmables le jeudi (valeur provisoire, à ajuster avec le client)'),
  ('heure_limite_soumission_programme', '"21:00"', 'Heure limite (Bénin) de soumission du programme hebdomadaire, le jeudi'),
  ('heure_cloture_journee', '"19:00"', 'Heure de clôture normale de la journée (Bénin)'),
  ('heure_cloture_forcee', '"20:00"', 'Heure de clôture automatique forcée si le VM n''a pas clôturé (Bénin)'),
  ('score_mensuel_minimal', '90', 'Score mensuel global minimal exigé (%)'),
  ('seuil_conformite_journaliere_pourcentage', '80', 'Taux minimal de correspondance déclaré / programmé exigé par journée (%)'),
  ('visites_minimum_medical_jour', '15', 'Nombre minimal de visites médicales programmables par jour'),
  ('visites_minimum_pharmacie_jour', '3', 'Nombre minimal de visites pharmacie programmables par jour'),
  ('jour_limite_plan_activites', '25', 'Jour limite du mois précédent pour la soumission du plan d''activités mensuel'),
  ('ratio_gros_minimum', '0.5', 'Ratio minimal de couverture des clients GROS potentiel avant pénalité de déséquilibre'),
  ('penalite_desequilibre_pourcentage', '20', 'Pénalité (%) appliquée au score de couverture en cas de déséquilibre marqué en défaveur des GROS')
on conflict (key) do nothing;
