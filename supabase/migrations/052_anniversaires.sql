alter table public.profiles add column if not exists date_anniversaire date;
create index if not exists profiles_anniversaire_idx on public.profiles ((extract(month from date_anniversaire)::int * 100 + extract(day from date_anniversaire)::int)) where date_anniversaire is not null;
create or replace function public.notifier_anniversaires() returns void language plpgsql security definer set search_path=public as $$
declare v_today date := (now() at time zone 'Africa/Porto-Novo')::date; v_profile record; v_dest record; v_age int;
begin
for v_profile in select id,full_name,date_anniversaire from profiles where actif=true and date_anniversaire is not null and to_char(date_anniversaire,'MM-DD')=to_char(v_today+7,'MM-DD') loop
 for v_dest in select id from profiles where actif=true and role in ('admin','superviseur') loop
  if not exists(select 1 from notifications n where n.profile_id=v_dest.id and n.type='ANNIVERSAIRE_J7' and n.metadata->>'membre_id'=v_profile.id::text and n.metadata->>'annee'=extract(year from v_today)::text) then
   insert into notifications(profile_id,type,titre,corps,metadata) values(v_dest.id,'ANNIVERSAIRE_J7','Anniversaire dans 7 jours',v_profile.full_name||' fêtera son anniversaire le '||to_char(v_today+7,'DD/MM/YYYY'),jsonb_build_object('membre_id',v_profile.id,'annee',extract(year from v_today)::int,'date_anniversaire',v_profile.date_anniversaire));
  end if;
 end loop;
end loop;
for v_profile in select id,full_name,date_anniversaire from profiles where actif=true and date_anniversaire is not null and to_char(date_anniversaire,'MM-DD')=to_char(v_today,'MM-DD') loop
 v_age:=extract(year from age(v_today,v_profile.date_anniversaire))::int;
 if not exists(select 1 from notifications n where n.profile_id=v_profile.id and n.type='ANNIVERSAIRE_JOUR_J' and n.metadata->>'annee'=extract(year from v_today)::text) then
  insert into notifications(profile_id,type,titre,corps,metadata) values(v_profile.id,'ANNIVERSAIRE_JOUR_J','Joyeux anniversaire 🎂',case when v_age>0 then 'Toute l''équipe GRAAL vous souhaite un très joyeux anniversaire pour vos '||v_age||' ans !' else 'Toute l''équipe GRAAL vous souhaite un très joyeux anniversaire !' end,jsonb_build_object('annee',extract(year from v_today)::int,'date_anniversaire',v_profile.date_anniversaire));
 end if;
end loop;
end; $$;
revoke execute on function public.notifier_anniversaires() from public;
select cron.schedule('graal-anniversaires','0 6 * * *',$$select public.notifier_anniversaires();$$);