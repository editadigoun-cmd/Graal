-- 023: obligation pour le VM de justifier un client sous-visité (audit cahier des charges, point 2).
-- Le VM peut déposer/mettre à jour une justification par client et par mois ; visible par
-- son superviseur et l'administrateur.

create table public.justifications_frequence (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  vm_id uuid not null references public.profiles(id) on delete cascade,
  mois date not null,
  justification text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, vm_id, mois)
);

create index justifications_frequence_vm_idx on public.justifications_frequence(vm_id);

create trigger justifications_frequence_set_updated_at
  before update on public.justifications_frequence
  for each row execute function public.set_updated_at();

alter table public.justifications_frequence enable row level security;

create policy justifications_frequence_select on public.justifications_frequence for select to authenticated using (
  public.is_admin() or vm_id = auth.uid() or public.is_vm_in_my_scope(vm_id)
);

create policy justifications_frequence_write on public.justifications_frequence for insert to authenticated
  with check (vm_id = auth.uid());

create policy justifications_frequence_update on public.justifications_frequence for update to authenticated
  using (vm_id = auth.uid())
  with check (vm_id = auth.uid());
