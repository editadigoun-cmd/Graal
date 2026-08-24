-- 044: CREATE OR REPLACE FUNCTION dans 043 a fait perdre le search_path fixé sur
-- trg_programme_lignes_validate() par 015_security_hardening.sql (même piège que 041→042).
alter function public.trg_programme_lignes_validate() set search_path = public;
