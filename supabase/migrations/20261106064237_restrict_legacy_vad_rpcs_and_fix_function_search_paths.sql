revoke execute on function public.activate_vad_session(uuid) from public, anon, authenticated;
revoke execute on function public.finish_vad_session(uuid) from public, anon, authenticated;
grant execute on function public.activate_vad_session(uuid) to service_role;
grant execute on function public.finish_vad_session(uuid) to service_role;

alter function public.activate_vad_session(uuid) set search_path = public, pg_temp;
alter function public.finish_vad_session(uuid) set search_path = public, pg_temp;
alter function public.potentiel_autorise(public.jour_semaine, public.potentiel_client) set search_path = public, pg_temp;
alter function public.trg_profiles_guard_role() set search_path = public, pg_temp;
alter function public.coord_plausible(double precision, double precision) set search_path = public, pg_temp;
alter function public.trg_programmes_guard_delai_supplementaire() set search_path = public, pg_temp;
alter function public.score_mensuel_vm_conforme(uuid, date) set search_path = public, pg_temp;
alter function public.lock_vad_plan_after_submission() set search_path = public, pg_temp;
alter function public.score_mensuel_vm(uuid, date) set search_path = public, pg_temp;
alter function public.trg_visites_validate() set search_path = public, pg_temp;
