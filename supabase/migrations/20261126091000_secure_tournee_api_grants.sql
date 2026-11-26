-- Réduire explicitement les privilèges API des tables et RPC du module Tournées.
revoke all on table public.tournees, public.tournee_jours, public.tournee_rapports, public.tournee_rencontres from anon, public;
grant select on table public.tournees, public.tournee_jours, public.tournee_rapports, public.tournee_rencontres to authenticated;
grant insert, update on table public.tournee_rapports to authenticated;
grant insert, delete on table public.tournee_rencontres to authenticated;

revoke all on schema private from anon, public;
grant usage on schema private to authenticated;
revoke all on function private.demander_tournee_impl(text,date,date) from anon, public;
revoke all on function private.decider_tournee_impl(uuid,boolean,text) from anon, public;
revoke all on function private.demarrer_journee_tournee_impl(uuid,date) from anon, public;
revoke all on function private.marquer_tournee_effectuee_impl(uuid) from anon, public;
revoke all on function private.soumettre_rapport_tournee_impl(uuid) from anon, public;
revoke all on function private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,text,text) from anon, public;
grant execute on function private.demander_tournee_impl(text,date,date) to authenticated;
grant execute on function private.decider_tournee_impl(uuid,boolean,text) to authenticated;
grant execute on function private.demarrer_journee_tournee_impl(uuid,date) to authenticated;
grant execute on function private.marquer_tournee_effectuee_impl(uuid) to authenticated;
grant execute on function private.soumettre_rapport_tournee_impl(uuid) to authenticated;
grant execute on function private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,text,text) to authenticated;

revoke all on function public.demander_tournee(text,date,date) from anon, public;
revoke all on function public.decider_tournee(uuid,boolean,text) from anon, public;
revoke all on function public.demarrer_journee_tournee(uuid,date) from anon, public;
revoke all on function public.marquer_tournee_effectuee(uuid) from anon, public;
revoke all on function public.soumettre_rapport_tournee(uuid) from anon, public;
revoke all on function public.ajouter_nouveau_prescripteur_tournee(uuid,text,text,public.specialite_client,public.potentiel_client,text,text) from anon, public;
grant execute on function public.demander_tournee(text,date,date) to authenticated;
grant execute on function public.decider_tournee(uuid,boolean,text) to authenticated;
grant execute on function public.demarrer_journee_tournee(uuid,date) to authenticated;
grant execute on function public.marquer_tournee_effectuee(uuid) to authenticated;
grant execute on function public.soumettre_rapport_tournee(uuid) to authenticated;
grant execute on function public.ajouter_nouveau_prescripteur_tournee(uuid,text,text,public.specialite_client,public.potentiel_client,text,text) to authenticated;
