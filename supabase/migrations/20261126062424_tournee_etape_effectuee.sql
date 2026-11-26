alter table public.tournee_jours drop constraint if exists tournee_jours_statut_check;
alter table public.tournee_jours add constraint tournee_jours_statut_check
  check (statut in ('A_DEMARRER','EN_COURS','EFFECTUEE','TERMINEE'));

create or replace function private.marquer_tournee_effectuee_impl(p_jour_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  update public.tournee_jours j set statut='EFFECTUEE'
  from public.tournees t
  where j.id=p_jour_id and j.tournee_id=t.id and t.demandeur_id=auth.uid()
    and t.statut='EN_COURS' and j.jour=public.benin_today() and j.statut='EN_COURS';
  if not found then raise exception 'Journée non démarrée, hors date ou déjà déclarée effectuée.'; end if;
end; $$;

create or replace function private.soumettre_rapport_tournee_impl(p_jour_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_tournee_id uuid; v_resume text;
begin
  select t.id,r.resume into v_tournee_id,v_resume
  from public.tournee_jours j join public.tournees t on t.id=j.tournee_id
  join public.tournee_rapports r on r.tournee_jour_id=j.id
  where j.id=p_jour_id and t.demandeur_id=auth.uid() and j.statut='EFFECTUEE' and r.soumis_at is null
  for update of j,r;
  if v_tournee_id is null then raise exception 'Rapport introuvable ou tournée non déclarée effectuée.'; end if;
  if nullif(trim(coalesce(v_resume,'')),'') is null then raise exception 'Le résumé de la tournée est obligatoire.'; end if;
  update public.tournee_rapports set soumis_at=now(),updated_at=now() where tournee_jour_id=p_jour_id;
  update public.tournee_jours set statut='TERMINEE',terminee_at=now() where id=p_jour_id;
  if not exists(select 1 from public.tournee_jours where tournee_id=v_tournee_id and statut <> 'TERMINEE') then
    update public.tournees set statut='TERMINEE',updated_at=now() where id=v_tournee_id;
  end if;
end; $$;

revoke all on function private.marquer_tournee_effectuee_impl(uuid) from public;
grant execute on function private.marquer_tournee_effectuee_impl(uuid) to authenticated;
create or replace function public.marquer_tournee_effectuee(p_jour_id uuid)
returns void language sql security invoker set search_path=public,private as $fn$ select private.marquer_tournee_effectuee_impl(p_jour_id); $fn$;
revoke all on function public.marquer_tournee_effectuee(uuid) from public;
grant execute on function public.marquer_tournee_effectuee(uuid) to authenticated;
