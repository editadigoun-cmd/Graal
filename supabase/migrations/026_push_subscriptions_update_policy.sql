-- Permet l'upsert (ON CONFLICT sur endpoint unique) : un appareil réutilisé par un autre
-- compte doit pouvoir réassigner la ligne existante à son propre profil.
create policy push_subscriptions_update on public.push_subscriptions for update to authenticated
  using (true)
  with check (profile_id = auth.uid());
