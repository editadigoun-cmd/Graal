do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.signature);
    execute format('grant execute on function %s to authenticated, service_role', r.signature);
  end loop;
end
$$;

alter view public.v_evaluation_superviseurs_mensuelle set (security_invoker = true);
alter view public.v_taux_realisation_journalier set (security_invoker = true);
alter view public.v_lignes_avec_statut set (security_invoker = true);
alter view public.v_clients_programmes_frequents set (security_invoker = true);
