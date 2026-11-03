-- Module anniversaires GRAAL : liste nominative, cartes et alertes J-2.
create table if not exists public.anniversaires_collaborateurs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  nom text not null,
  date_anniversaire date not null,
  annee_connue boolean not null default false,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists anniversaires_collaborateurs_mois_jour_idx
  on public.anniversaires_collaborateurs ((extract(month from date_anniversaire)::int), (extract(day from date_anniversaire)::int));
create table if not exists public.cartes_anniversaire (
  id uuid primary key default gen_random_uuid(),
  anniversaire_id uuid not null references public.anniversaires_collaborateurs(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.anniversaires_collaborateurs enable row level security;
alter table public.cartes_anniversaire enable row level security;
drop policy if exists anniversaires_select_scope on public.anniversaires_collaborateurs;
create policy anniversaires_select_scope on public.anniversaires_collaborateurs for select to authenticated
using (public.is_admin() or (public.is_superviseur() and profile_id in (select p.id from public.profiles p where p.role='vm' and p.equipe_id in (select public.supervised_equipe_ids()))));
drop policy if exists anniversaires_admin_write on public.anniversaires_collaborateurs;
create policy anniversaires_admin_write on public.anniversaires_collaborateurs for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists cartes_anniversaire_select_scope on public.cartes_anniversaire;
create policy cartes_anniversaire_select_scope on public.cartes_anniversaire for select to authenticated using (public.is_admin() or exists (
  select 1 from public.anniversaires_collaborateurs a join public.profiles vm on vm.id=a.profile_id where a.id=anniversaire_id and vm.role='vm' and vm.equipe_id in (select public.supervised_equipe_ids())
));
drop policy if exists cartes_anniversaire_insert_scope on public.cartes_anniversaire;
create policy cartes_anniversaire_insert_scope on public.cartes_anniversaire for insert to authenticated with check (created_by=auth.uid() and (public.is_admin() or exists (
  select 1 from public.anniversaires_collaborateurs a join public.profiles vm on vm.id=a.profile_id where a.id=anniversaire_id and vm.role='vm' and vm.equipe_id in (select public.supervised_equipe_ids())
)));
insert into storage.buckets (id,name,public) values ('anniversaires','anniversaires',true) on conflict (id) do nothing;
drop policy if exists anniversaires_photos_read on storage.objects;
create policy anniversaires_photos_read on storage.objects for select to authenticated using (bucket_id='anniversaires');
drop policy if exists anniversaires_photos_admin_insert on storage.objects;
create policy anniversaires_photos_admin_insert on storage.objects for insert to authenticated with check (bucket_id='anniversaires' and public.is_admin());
drop policy if exists anniversaires_photos_admin_update on storage.objects;
create policy anniversaires_photos_admin_update on storage.objects for update to authenticated using (bucket_id='anniversaires' and public.is_admin()) with check (bucket_id='anniversaires' and public.is_admin());
drop policy if exists anniversaires_photos_admin_delete on storage.objects;
create policy anniversaires_photos_admin_delete on storage.objects for delete to authenticated using (bucket_id='anniversaires' and public.is_admin());

with source(profile_id,nom,date_anniversaire,annee_connue) as (values
(null::uuid,'ZALE Sedo Evariste','1999-09-13'::date,true),
(null::uuid,'GNITA Olatounde Arnaurd','1995-08-05'::date,true),
(null::uuid,'AYENAN Djawou Jérôme','2000-11-12'::date,true),
(null::uuid,'AGOSSOUGBE Sessi Glawdys Aude','1992-09-03'::date,true),
(null::uuid,'BONI Esso Ikenti Jonathan','2000-11-12'::date,true),
(null::uuid,'HOUNFO Basile','1997-01-01'::date,true),
(null::uuid,'SEWA Olivier','1995-12-30'::date,true),
('bc2696ce-cbbc-43dc-ace7-fc0a1ffab29e'::uuid,'VINOUGNON Marc','1992-04-24'::date,true),
('a0436f11-d425-4014-9733-5c7cc4271189'::uuid,'AGONMA G. Raoul','1984-06-26'::date,true),
('d53c31c1-5adb-4549-82ca-0fff2a6692dd'::uuid,'DOSSOU Wilfried Joël','1995-06-06'::date,true),
(null::uuid,'IDOSSA Melchior','1996-09-25'::date,true),
('34deced5-26da-44c4-9bd5-7950e13552a9'::uuid,'FANOU Jérémy','1996-09-08'::date,true),
('40ace77b-6e6f-4208-99ff-3241229c8545'::uuid,'BONGO Sylvestre','1990-12-30'::date,true),
('62cdc900-5544-470a-94bf-ef30c9c8fb2f'::uuid,'SOSSAVI Prisca Lydie','1991-02-28'::date,true),
('d73bdceb-4bb3-496c-9d74-d24f6907c3b0'::uuid,'AMOUSSOU Émeline','1998-10-27'::date,true),
(null::uuid,'WATCHINOU Nathanaël','1900-07-27'::date,false),
('4519e59c-ae91-44d7-98a8-b906662a7f2d'::uuid,'GNAWOE Kodjo Herbert','1900-03-20'::date,false),
('fd879be3-1200-48be-a1ff-77d15bd4dc06'::uuid,'HOUNKPATIN Christel Xwenali','1900-06-27'::date,false),
('45a172c9-8e94-402b-90e5-a39f59bd584b'::uuid,'DENAHOU Yaba Pénélope','1900-08-28'::date,false),
('2aada0be-9c4c-4e00-b366-cc3b7bc4ff7f'::uuid,'GBAGUIDI Ahoffodji Dèwanou Gislain','1900-05-07'::date,false),
('96388406-e88e-4146-a372-1df07481c8e4'::uuid,'Gbêtoho Sabin Marcos','1900-11-28'::date,false),
('e86efe52-ed01-4d04-8eec-e539fd1e4b30'::uuid,'AKINDELE Akorede Fawaz','1900-08-23'::date,false),
('bb2519e6-04d8-4740-b878-a0b999ad7606'::uuid,'SAGBO Frankel','1900-07-23'::date,false)
)
insert into public.anniversaires_collaborateurs(profile_id,nom,date_anniversaire,annee_connue)
select s.profile_id,s.nom,s.date_anniversaire,s.annee_connue from source s
where not exists (select 1 from public.anniversaires_collaborateurs a where a.nom=s.nom or (s.profile_id is not null and a.profile_id=s.profile_id))
on conflict (profile_id) do update set nom=excluded.nom,date_anniversaire=excluded.date_anniversaire,annee_connue=excluded.annee_connue,updated_at=now();

create or replace function public.notifier_anniversaires()
returns void language plpgsql security definer set search_path=public as $$
declare v_today date := (now() at time zone 'Africa/Porto-Novo')::date; v_birthday record; v_dest_id uuid;
begin
  for v_birthday in select a.id,a.profile_id,a.nom,a.date_anniversaire from public.anniversaires_collaborateurs a
    where extract(month from a.date_anniversaire)=extract(month from v_today+2)
      and extract(day from a.date_anniversaire)=extract(day from v_today+2)
  loop
    for v_dest_id in
      select p.id from public.profiles p where p.actif=true and p.role='admin'
      union
      select s.superviseur_id from public.profiles vm join public.superviseur_equipes s on s.equipe_id=vm.equipe_id
      where vm.id=v_birthday.profile_id and vm.role='vm' and v_birthday.profile_id is not null
    loop
      if not exists(select 1 from public.notifications n where n.profile_id=v_dest_id and n.type='ANNIVERSAIRE_J2'
        and n.metadata->>'anniversaire_id'=v_birthday.id::text and n.metadata->>'annee'=extract(year from v_today)::text) then
        insert into public.notifications(profile_id,type,titre,corps,metadata)
        values(v_dest_id,'ANNIVERSAIRE_J2','Anniversaire dans 48 heures 🎂',
          v_birthday.nom||' fêtera son anniversaire le '||to_char(v_today+2,'DD/MM/YYYY')||'. Préparez son message GRAAL.',
          jsonb_build_object('anniversaire_id',v_birthday.id,'membre_id',v_birthday.profile_id,'annee',extract(year from v_today)::int,'date_anniversaire',v_birthday.date_anniversaire));
      end if;
    end loop;
  end loop;
end;
$$;
revoke execute on function public.notifier_anniversaires() from public,anon,authenticated;
do $$
declare v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname='graal-anniversaires' loop perform cron.unschedule(v_job_id); end loop;
  perform cron.schedule('graal-anniversaires','0 5 * * *','select public.notifier_anniversaires();');
end;
$$;
