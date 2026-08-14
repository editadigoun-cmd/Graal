-- Filet de sécurité pour les enregistrements d'appel : en plus du webhook Daily.co (temps
-- réel, mais qui peut échouer à être livré), on vérifie toutes les 5 minutes auprès de l'API
-- Daily.co si un enregistrement est disponible pour chaque appel terminé qui n'en a pas encore
-- reçu — évite qu'un enregistrement reste bloqué "en attente" indéfiniment sans qu'on le sache.
alter table public.appel_enregistrements add column if not exists daily_recording_id text;
create unique index if not exists appel_enregistrements_daily_recording_id_key
  on public.appel_enregistrements(daily_recording_id) where daily_recording_id is not null;

create or replace function public.verifier_enregistrements_appels()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api_key text;
  appel record;
  req_id bigint;
  tries int;
  body text;
  recs jsonb;
  rec jsonb;
  rec_id text;
  rec_status text;
  rec_duration numeric;
  link_req_id bigint;
  link_body text;
  link_json jsonb;
  download_link text;
begin
  select api_key into v_api_key from public.__get_daily_config();
  if v_api_key is null then
    return;
  end if;

  for appel in
    select a.id, a.daily_room_name
    from public.appels_programmes a
    where a.statut = 'TERMINE'
      and a.recording_actif is distinct from false
      and a.daily_room_name is not null
      and a.date_heure > now() - interval '3 days'
      and not exists (
        select 1 from public.appel_enregistrements e
        where e.appel_id = a.id and e.daily_recording_id is not null
      )
  loop
    req_id := net.http_get(
      url := 'https://api.daily.co/v1/recordings?room_name=' || appel.daily_room_name,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_api_key)
    );
    body := null;
    tries := 0;
    while body is null and tries < 10 loop
      perform pg_sleep(0.3);
      select content into body from net._http_response where id = req_id;
      tries := tries + 1;
    end loop;
    if body is null then
      continue;
    end if;

    recs := (body::jsonb) -> 'data';
    if recs is null then
      continue;
    end if;

    for rec in select * from jsonb_array_elements(recs)
    loop
      rec_id := rec ->> 'id';
      rec_status := rec ->> 'status';
      if rec_id is null then continue; end if;
      if rec_status = 'in-progress' then continue; end if;
      if exists (select 1 from public.appel_enregistrements where daily_recording_id = rec_id) then
        continue;
      end if;

      link_req_id := net.http_get(
        url := 'https://api.daily.co/v1/recordings/' || rec_id || '/access-link',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_api_key)
      );
      link_body := null;
      tries := 0;
      while link_body is null and tries < 10 loop
        perform pg_sleep(0.3);
        select content into link_body from net._http_response where id = link_req_id;
        tries := tries + 1;
      end loop;
      if link_body is null then continue; end if;

      link_json := link_body::jsonb;
      download_link := coalesce(link_json ->> 'download_link', link_json ->> 'downloadLink');
      if download_link is null then continue; end if;

      rec_duration := nullif(rec ->> 'duration', '')::numeric;

      insert into public.appel_enregistrements (appel_id, url, duree_secondes, daily_recording_id)
      values (appel.id, download_link, rec_duration, rec_id);
    end loop;
  end loop;
end;
$$;

select cron.schedule('graal-verifier-enregistrements-appels', '*/5 * * * *', $$select public.verifier_enregistrements_appels();$$);
