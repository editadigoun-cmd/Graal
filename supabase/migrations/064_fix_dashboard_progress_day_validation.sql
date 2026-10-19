-- Corrige les indicateurs du tableau de bord lorsque la validation est faite par jour.
-- Un jour validé doit être comptabilisé même si le programme de la semaine entière
-- n'est pas encore au statut VALIDE/VERROUILLE.

CREATE OR REPLACE VIEW public.v_taux_realisation_journalier AS
SELECT
  l.vm_id,
  l.date_visite AS jour,
  count(*) AS visites_prevues,
  count(*) FILTER (WHERE l.statut_reel = 'REALISEE'::text) AS visites_realisees,
  round(
    CASE
      WHEN public.is_fawaz_vm(l.vm_id)
        THEN LEAST(count(*) FILTER (WHERE l.statut_reel = 'REALISEE'::text), 12::bigint)::numeric / 12::numeric
      ELSE count(*) FILTER (WHERE l.statut_reel = 'REALISEE'::text)::numeric / NULLIF(count(*), 0)::numeric
    END, 4
  ) AS taux_realisation,
  CASE
    WHEN count(*) = 0 THEN NULL::boolean
    ELSE
      CASE
        WHEN public.is_fawaz_vm(l.vm_id)
          THEN LEAST(count(*) FILTER (WHERE l.statut_reel = 'REALISEE'::text), 12::bigint)::numeric / 12::numeric
        ELSE count(*) FILTER (WHERE l.statut_reel = 'REALISEE'::text)::numeric / count(*)::numeric
      END >= (public.parametre_numeric('seuil_conformite_journaliere_pourcentage'::text, 80::numeric) / 100.0)
  END AS conforme
FROM public.v_lignes_avec_statut l
WHERE
  l.programme_statut = ANY (ARRAY['VALIDE'::public.statut_programme, 'VERROUILLE'::public.statut_programme])
  OR EXISTS (
    SELECT 1
    FROM public.programme_jours_validation pj
    WHERE pj.programme_id = l.programme_id
      AND pj.jour = l.jour
      AND pj.statut = 'VALIDE'
  )
GROUP BY l.vm_id, l.date_visite;
