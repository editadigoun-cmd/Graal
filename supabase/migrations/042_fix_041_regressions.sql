-- 042: corrige deux régressions introduites par la migration 041, détectées via l'advisor de
-- sécurité Supabase juste après application :
-- 1) create or replace function réinitialise TOUS les attributs de la fonction sauf ceux
--    explicitement redéfinis — le `set search_path = public` que 015_security_hardening.sql
--    avait ajouté à trg_profiles_guard_role() a donc été perdu par le `create or replace` de 041.
-- 2) Ce projet Supabase a un ALTER DEFAULT PRIVILEGES qui accorde EXECUTE à anon/authenticated/
--    service_role sur toute nouvelle fonction créée dans public — un simple
--    `revoke execute ... from public` (fait en 041) ne retire donc PAS ce droit accordé
--    explicitement à anon (voir le `revoke ... from anon` dédié que 015 fait pour chaque RPC
--    sensible). accorder_derogation_doublon_client() restait donc exécutable anonymement.

alter function public.trg_profiles_guard_role() set search_path = public;

revoke execute on function public.accorder_derogation_doublon_client(uuid, uuid, text) from anon;
