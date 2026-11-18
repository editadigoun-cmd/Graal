-- Weekly planning for supervisors' own field visits, separate from VM programmes.
create table if not exists public.programmes_visites_superviseurs (
  id uuid primary key default gen_random_uuid(),
  superviseur_id uuid not null references public.profiles(id) on delete cascade,
  semaine_debut date not null check (extract(isodow from semaine_debut)=1),
  statut text not null default 'BROUILLON' check (statut in ('BROUILLON','SOUMIS','VALIDE','REFUSE')),
  soumis_at timestamptz,
  valide_at timestamptz,
  valide_par uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(superviseur_id,semaine_debut)
);
create table if not exists public.programme_visites_superviseur_lignes (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes_visites_superviseurs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  jour public.jour_semaine not null,
  type_visite public.type_visite not null,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  unique(programme_id,jour,client_id)
);
create index if not exists idx_pvs_superviseur_semaine on public.programmes_visites_superviseurs(superviseur_id,semaine_debut desc);
create index if not exists idx_pvsl_programme_jour on public.programme_visites_superviseur_lignes(programme_id,jour);

alter table public.programmes_visites_superviseurs enable row level security;
alter table public.programme_visites_superviseur_lignes enable row level security;

drop policy if exists pvs_select on public.programmes_visites_superviseurs;
create policy pvs_select on public.programmes_visites_superviseurs for select to authenticated
using (superviseur_id=auth.uid() or public.is_admin());
drop policy if exists pvs_insert on public.programmes_visites_superviseurs;
create policy pvs_insert on public.programmes_visites_superviseurs for insert to authenticated
with check (superviseur_id=auth.uid() and public.is_superviseur());
drop policy if exists pvs_update on public.programmes_visites_superviseurs;
create policy pvs_update on public.programmes_visites_superviseurs for update to authenticated
using ((superviseur_id=auth.uid() and statut in ('BROUILLON','REFUSE')) or public.is_admin())
with check ((superviseur_id=auth.uid() and statut in ('BROUILLON','REFUSE','SOUMIS')) or public.is_admin());

drop policy if exists pvsl_select on public.programme_visites_superviseur_lignes;
create policy pvsl_select on public.programme_visites_superviseur_lignes for select to authenticated
using (exists(select 1 from public.programmes_visites_superviseurs p where p.id=programme_id and (p.superviseur_id=auth.uid() or public.is_admin())));
drop policy if exists pvsl_insert on public.programme_visites_superviseur_lignes;
create policy pvsl_insert on public.programme_visites_superviseur_lignes for insert to authenticated
with check (exists(select 1 from public.programmes_visites_superviseurs p where p.id=programme_id and p.superviseur_id=auth.uid() and p.statut in ('BROUILLON','REFUSE'))
 and exists(select 1 from public.portefeuille_superviseurs ps where ps.superviseur_id=auth.uid() and ps.client_id=programme_visites_superviseur_lignes.client_id));
drop policy if exists pvsl_delete on public.programme_visites_superviseur_lignes;
create policy pvsl_delete on public.programme_visites_superviseur_lignes for delete to authenticated
using (exists(select 1 from public.programmes_visites_superviseurs p where p.id=programme_id and p.superviseur_id=auth.uid() and p.statut in ('BROUILLON','REFUSE')));

create or replace function public.verifier_quota_programme_superviseur()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_med integer; v_pharma integer; v_owner uuid; v_status text;
begin
 select p.superviseur_id,p.statut into v_owner,v_status from public.programmes_visites_superviseurs p where p.id=new.programme_id;
 if v_owner is null or v_status not in ('BROUILLON','REFUSE') then raise exception 'Ce planning n’est plus modifiable.'; end if;
 if not exists(select 1 from public.portefeuille_superviseurs ps where ps.superviseur_id=v_owner and ps.client_id=new.client_id) then
   raise exception 'Ce client ne figure pas dans votre portefeuille superviseur.';
 end if;
 select count(*) filter(where l.type_visite='MEDICAL'),count(*) filter(where l.type_visite='PHARMACIE')
 into v_med,v_pharma from public.programme_visites_superviseur_lignes l
 where l.programme_id=new.programme_id and l.jour=new.jour and l.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
 if new.type_visite='MEDICAL' then v_med:=v_med+1; else v_pharma:=v_pharma+1; end if;
 if v_med>8 then raise exception '% : maximum 8 visites médicales par jour.',new.jour; end if;
 if v_pharma>2 then raise exception '% : maximum 2 visites pharmacie par jour.',new.jour; end if;
 return new;
end $$;
drop trigger if exists trg_verifier_quota_programme_superviseur on public.programme_visites_superviseur_lignes;
create trigger trg_verifier_quota_programme_superviseur before insert or update on public.programme_visites_superviseur_lignes
for each row execute function public.verifier_quota_programme_superviseur();
grant select,insert,update on public.programmes_visites_superviseurs to authenticated;
grant select,insert,delete,update on public.programme_visites_superviseur_lignes to authenticated;
