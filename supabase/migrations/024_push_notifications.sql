-- 024: notifications push web (au-delà du in-app existant — audit cahier des charges, point 18).
--
-- IMPORTANT — secrets non inclus ici volontairement (jamais de clé privée dans le
-- contrôle de version) : après avoir appliqué ce fichier, exécuter séparément (via le
-- SQL Editor Supabase, PAS via une migration versionnée) :
--
--   select vault.create_secret('<clé privée VAPID au format JWK JSON>', 'vapid_private_key_jwk', '...');
--   select vault.create_secret('<secret partagé aléatoire>', 'push_trigger_secret', '...');
--   insert into public.parametres (key, value, description) values
--     ('vapid_public_key', to_jsonb('<clé publique VAPID, point non compressé, base64url>'::text), '...'),
--     ('vapid_subject', to_jsonb('mailto:contact@example.com'::text), '...')
--   on conflict (key) do nothing;
--
-- Les clés VAPID (paire ECDSA P-256) se génèrent avec n'importe quel outil standard
-- (ex: la lib web-push, ou crypto.generateKeyPairSync('ec', {namedCurve:'prime256v1'})).

create extension if not exists pg_net;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_profile_idx on public.push_subscriptions(profile_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (profile_id = auth.uid());
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated with check (profile_id = auth.uid());
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated using (profile_id = auth.uid());

-- Relaie chaque nouvelle notification vers l'edge function send-push, qui lit
-- push_subscriptions et envoie une notification push (vide, sans payload chiffré :
-- le service worker va chercher le contenu réel auprès de l'API au réveil).
create or replace function public.notifier_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_trigger_secret';
  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://bjwcsfdvucrwtlheivuu.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-graal-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$$;

create trigger notifications_push_after_insert
  after insert on public.notifications
  for each row execute function public.notifier_push();

-- vault n'est pas exposé via PostgREST (par sécurité) : cette fonction SECURITY DEFINER,
-- réservée à service_role, est l'unique point d'accès pour l'edge function send-push
-- (qui, elle, passe par supabase-js/PostgREST et ne peut pas interroger vault directement).
create or replace function public.__get_push_config()
returns table(private_key_jwk text, subject text, trigger_secret text)
language sql security definer set search_path = public, vault as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key_jwk'),
    (select value #>> '{}' from public.parametres where key = 'vapid_subject'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_trigger_secret');
$$;

revoke all on function public.__get_push_config() from public;
revoke all on function public.__get_push_config() from anon, authenticated;
grant execute on function public.__get_push_config() to service_role;
