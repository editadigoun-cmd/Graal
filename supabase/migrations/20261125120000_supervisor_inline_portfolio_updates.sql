drop policy if exists clients_update_supervisor_portfolio on public.clients;
create policy clients_update_supervisor_portfolio
on public.clients
for update
to authenticated
using (
  is_superviseur()
  and (
    exists (
      select 1 from public.portefeuille_superviseurs ps
      where ps.client_id = clients.id
        and ps.superviseur_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.portefeuille p
      join public.profiles vm on vm.id = p.vm_id
      where p.client_id = clients.id
        and vm.equipe_id in (select public.supervised_equipe_ids())
    )
  )
)
with check (
  is_superviseur()
  and (
    exists (
      select 1 from public.portefeuille_superviseurs ps
      where ps.client_id = clients.id
        and ps.superviseur_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.portefeuille p
      join public.profiles vm on vm.id = p.vm_id
      where p.client_id = clients.id
        and vm.equipe_id in (select public.supervised_equipe_ids())
    )
  )
);