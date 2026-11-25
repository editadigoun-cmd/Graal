drop policy if exists portefeuille_supervisor_insert_team_vm on public.portefeuille;
create policy portefeuille_supervisor_insert_team_vm
on public.portefeuille
for insert
to authenticated
with check (
  is_superviseur()
  and exists (
    select 1 from public.profiles vm
    where vm.id = portefeuille.vm_id
      and vm.equipe_id in (select public.supervised_equipe_ids())
  )
  and exists (
    select 1 from public.portefeuille existing
    join public.profiles existing_vm on existing_vm.id = existing.vm_id
    where existing.client_id = portefeuille.client_id
      and existing_vm.equipe_id in (select public.supervised_equipe_ids())
  )
);

drop policy if exists portefeuille_supervisor_delete_team_vm on public.portefeuille;
create policy portefeuille_supervisor_delete_team_vm
on public.portefeuille
for delete
to authenticated
using (
  is_superviseur()
  and exists (
    select 1 from public.profiles vm
    where vm.id = portefeuille.vm_id
      and vm.equipe_id in (select public.supervised_equipe_ids())
  )
);