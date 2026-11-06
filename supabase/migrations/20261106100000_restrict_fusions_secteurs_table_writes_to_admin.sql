-- Keep direct table access aligned with the admin-only fusion RPC.
-- Supervisors may read active fusion settings, but only admins may mutate them.
drop policy if exists fusions_write on public.fusions_secteurs;

create policy fusions_write
on public.fusions_secteurs
for all
to authenticated
using (is_admin())
with check (is_admin());
