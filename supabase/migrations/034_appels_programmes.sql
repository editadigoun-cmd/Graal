-- Appels programmés pour les forums (global/équipe) : titre, date/heure, motif,
-- lien d'appel audio (Daily.co, créé à la demande via edge function create-daily-room),
-- rappels automatiques à 1h/30min/5min avant, et enregistrement (visible admin/superviseur
-- uniquement) déposé automatiquement par webhook Daily.co à la fin de l'appel.

create table public.appels_programmes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  titre text not null,
  motif text,
  programme_par uuid not null references public.profiles(id),
  date_heure timestamptz not null,
  statut text not null default 'PROGRAMME' check (statut in ('PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE')),
  daily_room_name text,
  daily_room_url text,
  rappel_1h_envoye boolean not null default false,
  rappel_30min_envoye boolean not null default false,
  rappel_5min_envoye boolean not null default false,
  created_at timestamptz not null default now()
);

create index appels_programmes_conversation_idx on public.appels_programmes(conversation_id, date_heure);

create table public.appel_enregistrements (
  id uuid primary key default gen_random_uuid(),
  appel_id uuid not null references public.appels_programmes(id) on delete cascade,
  url text not null,
  duree_secondes int,
  created_at timestamptz not null default now()
);

alter table public.appels_programmes enable row level security;
alter table public.appel_enregistrements enable row level security;

-- Tout participant du forum (VM inclus) doit voir l'appel programmé pour pouvoir le
-- rejoindre — seule la programmation (insert) et l'enregistrement (table séparée) sont
-- restreints à admin/superviseur.
create policy appels_select on public.appels_programmes for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = appels_programmes.conversation_id and cp.profile_id = auth.uid()
  )
);

create policy appels_insert on public.appels_programmes for insert to authenticated with check (
  programme_par = auth.uid() and (
    public.is_admin()
    or (
      public.is_superviseur() and exists (
        select 1 from public.conversations c
        where c.id = conversation_id and c.type = 'EQUIPE' and c.equipe_id in (select public.supervised_equipe_ids())
      )
    )
  )
);

create policy appels_update on public.appels_programmes for update to authenticated using (
  public.is_admin() or programme_par = auth.uid()
);

-- Enregistrements : uniquement admin, ou superviseur du forum d'équipe concerné.
create policy enregistrements_select on public.appel_enregistrements for select to authenticated using (
  public.is_admin() or (
    public.is_superviseur() and exists (
      select 1 from public.appels_programmes ap
      join public.conversations c on c.id = ap.conversation_id
      where ap.id = appel_enregistrements.appel_id and c.equipe_id in (select public.supervised_equipe_ids())
    )
  )
);
-- Aucune policy insert/update/delete : le webhook Daily.co écrit via la clé service_role,
-- qui contourne RLS — un enregistrement ne doit jamais pouvoir être déposé ou falsifié
-- depuis le client.

-- ===================== rappels automatiques =====================

create or replace function public.envoyer_rappels_appels()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select id, conversation_id, titre, date_heure, '1h' as palier from public.appels_programmes
    where statut = 'PROGRAMME' and not rappel_1h_envoye and date_heure > now() and date_heure - now() <= interval '60 minutes'
    union all
    select id, conversation_id, titre, date_heure, '30min' as palier from public.appels_programmes
    where statut = 'PROGRAMME' and not rappel_30min_envoye and date_heure > now() and date_heure - now() <= interval '30 minutes'
    union all
    select id, conversation_id, titre, date_heure, '5min' as palier from public.appels_programmes
    where statut = 'PROGRAMME' and not rappel_5min_envoye and date_heure > now() and date_heure - now() <= interval '5 minutes'
  loop
    insert into public.notifications (profile_id, type, titre, corps, metadata)
    select cp.profile_id, 'RAPPEL_APPEL',
      format('Appel "%s" dans %s', r.titre, case r.palier when '1h' then '1 heure' when '30min' then '30 minutes' else '5 minutes' end),
      format('Prévu à %s (heure du Bénin).', to_char(r.date_heure at time zone 'Africa/Porto-Novo', 'HH24:MI')),
      jsonb_build_object('appel_id', r.id, 'conversation_id', r.conversation_id)
    from public.conversation_participants cp
    where cp.conversation_id = r.conversation_id;

    if r.palier = '1h' then
      update public.appels_programmes set rappel_1h_envoye = true where id = r.id;
    elsif r.palier = '30min' then
      update public.appels_programmes set rappel_30min_envoye = true where id = r.id;
    else
      update public.appels_programmes set rappel_5min_envoye = true where id = r.id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.envoyer_rappels_appels() from public;

select cron.schedule('graal-rappels-appels', '* * * * *', $$select public.envoyer_rappels_appels();$$);

-- ===================== configuration Daily.co (secrets, à renseigner) =====================
-- Une fois le compte Daily.co créé, exécuter (avec les vraies valeurs) :
--   select vault.create_secret('<clé API Daily.co>', 'daily_api_key', 'Clé API Daily.co pour la création de salles d''appel');
--   select vault.create_secret('<sous-domaine>.daily.co', 'daily_domain', 'Sous-domaine Daily.co de l''organisation');
--   select vault.create_secret('<secret webhook Daily.co>', 'daily_webhook_secret', 'Secret HMAC pour vérifier les webhooks Daily.co (optionnel mais recommandé)');

create or replace function public.__get_daily_config()
returns table(api_key text, domain text, webhook_secret text)
language sql security definer set search_path = public, vault as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'daily_api_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'daily_domain'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'daily_webhook_secret');
$$;

revoke all on function public.__get_daily_config() from public;
revoke all on function public.__get_daily_config() from anon, authenticated;
grant execute on function public.__get_daily_config() to service_role;
