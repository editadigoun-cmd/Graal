drop policy if exists tournee_programmations_owner_insert on public.tournee_programmations;
create policy tournee_programmations_owner_insert on public.tournee_programmations for insert to authenticated with check (
 exists(select 1 from public.tournee_jours j join public.tournees t on t.id=j.tournee_id where j.id=tournee_jour_id
  and t.demandeur_id=auth.uid() and t.avec_portefeuille and t.statut in ('APPROUVEE','EN_COURS') and j.statut='A_DEMARRER')
 and exists(select 1 from public.portefeuille p where p.client_id=tournee_programmations.client_id and p.vm_id=auth.uid())
);
