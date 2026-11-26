create table public.tournee_programmations (
 id uuid primary key default gen_random_uuid(),
 tournee_jour_id uuid not null references public.tournee_jours(id) on delete cascade,
 client_id uuid not null references public.clients(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(tournee_jour_id,client_id)
);
create index tournee_programmations_jour_idx on public.tournee_programmations(tournee_jour_id);
alter table public.tournee_programmations enable row level security;
create policy tournee_programmations_read_scope on public.tournee_programmations for select to authenticated using (
 exists(select 1 from public.tournee_jours j join public.tournees t on t.id=j.tournee_id where j.id=tournee_jour_id and (
  public.is_admin() or t.demandeur_id=auth.uid()
  or (public.is_superviseur() and exists(select 1 from public.profiles vm where vm.id=t.demandeur_id and vm.equipe_id in (select public.supervised_equipe_ids())))
 ))
);
create policy tournee_programmations_owner_insert on public.tournee_programmations for insert to authenticated with check (
 exists(select 1 from public.tournee_jours j join public.tournees t on t.id=j.tournee_id where j.id=tournee_jour_id
  and t.demandeur_id=auth.uid() and t.avec_portefeuille and t.statut='APPROUVEE' and j.statut='A_DEMARRER')
 and exists(select 1 from public.portefeuille p where p.client_id=client_id and p.vm_id=auth.uid())
);
create policy tournee_programmations_owner_delete on public.tournee_programmations for delete to authenticated using (
 exists(select 1 from public.tournee_jours j join public.tournees t on t.id=j.tournee_id where j.id=tournee_jour_id
  and t.demandeur_id=auth.uid() and t.avec_portefeuille and j.statut='A_DEMARRER')
);
revoke all on table public.tournee_programmations from anon, public;
grant select,insert,delete on table public.tournee_programmations to authenticated;
