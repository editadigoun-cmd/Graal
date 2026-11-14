INSERT INTO public.equipes (id,nom,actif)
VALUES ('d8e7f5d2-0d77-4c0b-8a01-000000000002','ODYPHARM2',true)
ON CONFLICT (nom) DO UPDATE SET actif=true;

CREATE TABLE IF NOT EXISTS public.quotas_pharmacie_journaliers (
  equipe_id uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  jour public.jour_semaine NOT NULL,
  potentiel public.potentiel_client NOT NULL,
  quota integer NOT NULL CHECK (quota >= 0),
  PRIMARY KEY (equipe_id,jour,potentiel),
  CHECK (jour IN ('LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI'))
);
ALTER TABLE public.quotas_pharmacie_journaliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotas_pharmacie_journaliers_read ON public.quotas_pharmacie_journaliers;
CREATE POLICY quotas_pharmacie_journaliers_read ON public.quotas_pharmacie_journaliers FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.quotas_pharmacie_journaliers TO authenticated;

INSERT INTO public.quotas_pharmacie_journaliers (equipe_id,jour,potentiel,quota) VALUES
('d8e7f5d2-0d77-4c0b-8a01-000000000002','LUNDI','G+',3),('d8e7f5d2-0d77-4c0b-8a01-000000000002','LUNDI','GROS',4),('d8e7f5d2-0d77-4c0b-8a01-000000000002','LUNDI','MOYEN',8),
('d8e7f5d2-0d77-4c0b-8a01-000000000002','MARDI','G+',3),('d8e7f5d2-0d77-4c0b-8a01-000000000002','MARDI','GROS',4),('d8e7f5d2-0d77-4c0b-8a01-000000000002','MARDI','MOYEN',8),
('d8e7f5d2-0d77-4c0b-8a01-000000000002','MERCREDI','G+',3),('d8e7f5d2-0d77-4c0b-8a01-000000000002','MERCREDI','GROS',4),('d8e7f5d2-0d77-4c0b-8a01-000000000002','MERCREDI','MOYEN',8),
('d8e7f5d2-0d77-4c0b-8a01-000000000002','JEUDI','GROS',1),('d8e7f5d2-0d77-4c0b-8a01-000000000002','JEUDI','MOYEN',9),('d8e7f5d2-0d77-4c0b-8a01-000000000002','JEUDI','FAIBLE',5),
('d8e7f5d2-0d77-4c0b-8a01-000000000002','VENDREDI','MOYEN',9),('d8e7f5d2-0d77-4c0b-8a01-000000000002','VENDREDI','FAIBLE',6)
ON CONFLICT (equipe_id,jour,potentiel) DO UPDATE SET quota=excluded.quota;

INSERT INTO public.quotas_cibles (equipe_id,cible,libelle,quota_hebdomadaire,ordre)
VALUES ('d8e7f5d2-0d77-4c0b-8a01-000000000002','PHARMACIES','Pharmacies',75,1)
ON CONFLICT (equipe_id,cible) DO UPDATE SET libelle=excluded.libelle,quota_hebdomadaire=excluded.quota_hebdomadaire,ordre=excluded.ordre;
INSERT INTO public.cible_specialite_map (equipe_id,cible,specialite)
VALUES ('d8e7f5d2-0d77-4c0b-8a01-000000000002','PHARMACIES','PHARMACIE')
ON CONFLICT DO NOTHING;

INSERT INTO public.superviseur_equipes (superviseur_id,equipe_id)
SELECT superviseur_id,'d8e7f5d2-0d77-4c0b-8a01-000000000002'
FROM public.superviseur_equipes WHERE equipe_id='929677bc-0a37-4fbd-bb27-074153aad709'
ON CONFLICT DO NOTHING;

SELECT set_config('graal.internal_rpc','on',true);
UPDATE public.profiles
SET equipe_id='d8e7f5d2-0d77-4c0b-8a01-000000000002',secteur=NULL,updated_at=now()
WHERE id IN ('2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f','96388406-e88e-4146-a372-1df07481c8e4');

DELETE FROM public.programme_lignes
WHERE programme_id IN (SELECT id FROM public.programmes_hebdomadaires WHERE semaine_debut='2026-11-16' AND vm_id IN ('2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f','96388406-e88e-4146-a372-1df07481c8e4'));
DELETE FROM public.programme_jours_validation
WHERE programme_id IN (SELECT id FROM public.programmes_hebdomadaires WHERE semaine_debut='2026-11-16' AND vm_id IN ('2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f','96388406-e88e-4146-a372-1df07481c8e4'));
DELETE FROM public.programme_conformite
WHERE programme_id IN (SELECT id FROM public.programmes_hebdomadaires WHERE semaine_debut='2026-11-16' AND vm_id IN ('2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f','96388406-e88e-4146-a372-1df07481c8e4'));
UPDATE public.programmes_hebdomadaires SET secteur=NULL,mode_pharmacie_uniquement=false,updated_at=now()
WHERE semaine_debut='2026-11-16' AND vm_id IN ('2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f','96388406-e88e-4146-a372-1df07481c8e4');
