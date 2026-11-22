-- Objectif de quantité fixe associé au produit, indépendamment du mois.
alter table public.produits_pilotage
  add column if not exists objectif_quantite numeric(10,2) check (objectif_quantite >= 0);

-- Les produits avaient une seule ligne d'objectif par mois dans la base à ce jour.
-- Transfert de la valeur existante vers le champ produit, sans supprimer l'historique.
update public.produits_pilotage pp
set objectif_quantite = o.objectif_quantite
from public.objectifs_mensuels_produits o
where o.produit_id = pp.produit_id
  and pp.objectif_quantite is null;

comment on column public.produits_pilotage.objectif_quantite is
  'Objectif de quantité fixe associé au produit (non daté par mois).';
