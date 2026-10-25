-- Suppression définitive du module de facturation.
-- Les données historiques de proformas, bordereaux, clients/produits de facturation et compteurs
-- sont supprimées avec les tables dédiées. Aucun client médical, produit commercial ou portefeuille
-- de visites n'est concerné.
drop function if exists public.next_billing_number(text) cascade;

drop table if exists
  public.bordereau_items,
  public.bordereaux_livraison,
  public.proforma_items,
  public.proformas,
  public.billing_products,
  public.billing_clients,
  public.billing_counters
cascade;
