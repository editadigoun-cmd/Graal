drop policy if exists tournee_encounter_owner_insert on public.tournee_rencontres;
create policy tournee_encounter_owner_insert on public.tournee_rencontres for insert to authenticated with check (
 nouveau_prescripteur = false
 and exists (
  select 1 from public.tournee_rapports r
  join public.tournee_jours j on j.id=r.tournee_jour_id
  join public.tournees t on t.id=j.tournee_id
  where r.id=rapport_id and r.soumis_at is null and t.demandeur_id=auth.uid()
    and (
      (t.avec_portefeuille and tournee_rencontres.client_id is not null and exists (
        select 1 from public.portefeuille p where p.client_id=tournee_rencontres.client_id and p.vm_id=auth.uid()
      ))
      or (not t.avec_portefeuille and tournee_rencontres.client_id is null)
    )
 )
);
