-- Remove privileges that bypass RLS or are not needed by browser clients.
-- Keep normal CRUD grants intact; row access remains controlled by existing RLS policies.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

-- This legacy table is empty and is not used by the current sales-pilotage module.
-- Keep it available only to trusted server/database roles.
DROP POLICY IF EXISTS estimations_ventes_stock_authenticated_access ON public.estimations_ventes_stock;
REVOKE ALL ON TABLE public.estimations_ventes_stock FROM anon, authenticated;

-- No anonymous client should access profile records or push endpoint credentials.
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon;
