-- 047: chaque notification in-app (table notifications) est désormais aussi envoyée par email
-- au profil concerné — demande explicite du client, en plus du push web déjà en place (024).
--
-- Le volume est naturellement borné : cette table ne sert qu'aux alertes métier (soumission
-- hors délai, programme rejeté, clôture forcée, rappels planifiés, non-conformité, garde
-- terminée, rappel d'appel...) — jamais aux messages de la messagerie interne, qui passent par
-- une table séparée (messages) et ne déclenchent pas ce trigger.
--
-- Réutilise le même secret partagé que notifier_push() (024_push_notifications.sql) : aucune
-- configuration supplémentaire requise si BREVO_API_KEY/BREVO_FROM_EMAIL (ou RESEND_API_KEY)
-- sont déjà positionnés comme secrets Edge Function (déjà le cas, utilisés par create-user).

create or replace function public.notifier_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_trigger_secret';
  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://bjwcsfdvucrwtlheivuu.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-graal-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$$;

create trigger notifications_email_after_insert
  after insert on public.notifications
  for each row execute function public.notifier_email();
