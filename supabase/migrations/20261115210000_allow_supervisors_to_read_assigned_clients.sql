-- Allow each supervisor to read only the clients explicitly assigned to their personal portfolio.
-- This complements the existing team/VM portfolio access policy without changing assignments.
create policy clients_select_supervisor_assigned
on public.clients
for select
to authenticated
using (
  public.is_superviseur()
  and exists (
    select 1
    from public.portefeuille_superviseurs ps
    where ps.client_id = clients.id
      and ps.superviseur_id = (select auth.uid())
  )
);
