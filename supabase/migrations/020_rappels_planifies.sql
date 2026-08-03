-- 020: rappels programmés (spec 3.6 : jeudi 18h/20h30 soumission ; 3.10 : 18h30/18h55 clôture)
-- Bénin = UTC+1 fixe (voir 014_cron.sql).

create or replace function public.rappel_soumission_programme()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_semaine date := public.benin_today() + (8 - extract(isodow from public.benin_today()))::int;
begin
  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select p.id, 'RAPPEL_SOUMISSION', 'Programme hebdomadaire à soumettre',
    format('Pensez à soumettre votre programme de la semaine du %s avant jeudi 21h00.', to_char(v_semaine, 'DD/MM/YYYY')),
    jsonb_build_object('semaine_debut', v_semaine)
  from public.profiles p
  where p.role = 'vm' and p.actif
    and not exists (
      select 1 from public.programmes_hebdomadaires ph
      where ph.vm_id = p.id and ph.semaine_debut = v_semaine and ph.statut <> 'BROUILLON'
    );
end;
$$;

create or replace function public.rappel_cloture_journee()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_jour date := public.benin_today();
begin
  insert into public.notifications (profile_id, type, titre, corps, metadata)
  select distinct ph.vm_id, 'RAPPEL_CLOTURE', 'Clôture de journée à faire',
    'Pensez à clôturer votre journée avant 19h00 (photo de la fiche papier requise).',
    jsonb_build_object('jour', v_jour)
  from public.programmes_hebdomadaires ph
  join public.programme_lignes pl on pl.programme_id = ph.id
  where ph.statut in ('VALIDE', 'VERROUILLE')
    and ph.semaine_debut + public.jour_offset(pl.jour) = v_jour
    and not exists (
      select 1 from public.clotures_journalieres c where c.vm_id = ph.vm_id and c.jour = v_jour and c.statut <> 'EN_ATTENTE'
    );
end;
$$;

revoke execute on function public.rappel_soumission_programme() from public;
revoke execute on function public.rappel_cloture_journee() from public;

select cron.schedule('graal-rappel-soumission-18h', '0 17 * * 4', $$select public.rappel_soumission_programme();$$);
select cron.schedule('graal-rappel-soumission-2030h', '30 19 * * 4', $$select public.rappel_soumission_programme();$$);
select cron.schedule('graal-rappel-cloture-1830h', '30 17 * * 1-5', $$select public.rappel_cloture_journee();$$);
select cron.schedule('graal-rappel-cloture-1855h', '55 17 * * 1-5', $$select public.rappel_cloture_journee();$$);
