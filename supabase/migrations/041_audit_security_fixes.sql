-- 041: corrections de sécurité issues d'un audit complet de la plateforme.
--
-- 1) Le bucket "messagerie" était lisible par n'importe quel utilisateur authentifié (la policy
--    ne vérifiait que bucket_id, contrairement à sa jumelle "fiches-papier" qui vérifie bien le
--    propriétaire / l'admin / le périmètre superviseur) : n'importe quel VM pouvait donc lire les
--    photos, notes vocales et pièces jointes de n'importe quelle conversation d'autrui.
-- 2) Le catalogue produits est propre à chaque équipe depuis la migration 037, mais la policy de
--    lecture (using (true)) n'avait jamais été resserrée : un accès direct à l'API exposait le
--    catalogue de toutes les équipes.
-- 3) La colonne profiles.zone_id (migration 040) n'était pas couverte par le trigger qui protège
--    déjà role/secteur/equipe_id contre une auto-modification par l'utilisateur lui-même.
-- 4) Aucun moyen (RPC) n'existait pour qu'un admin accorde la dérogation "client visité deux fois
--    dans la semaine" déjà prévue par le moteur de règles — le VM concerné restait bloqué sans
--    recours possible.

drop policy if exists storage_messagerie_read on storage.objects;
create policy storage_messagerie_read on storage.objects for select to authenticated
  using (
    bucket_id = 'messagerie' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1 from public.messages m
        join public.conversation_participants cp on cp.conversation_id = m.conversation_id
        where m.piece_jointe_path = storage.objects.name and cp.profile_id = auth.uid()
      )
    )
  );

drop policy if exists produits_select on public.produits;
create policy produits_select on public.produits for select to authenticated using (
  public.is_admin()
  or equipe_id = public.current_equipe()
  or equipe_id in (select public.supervised_equipe_ids())
);

create or replace function public.trg_profiles_guard_role()
returns trigger language plpgsql as $$
begin
  if (new.role, new.secteur, new.equipe_id, new.zone_id) is distinct from (old.role, old.secteur, old.equipe_id, old.zone_id)
     and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le rôle, le secteur, l''équipe ou la zone d''un utilisateur';
  end if;
  return new;
end;
$$;

create or replace function public.accorder_derogation_doublon_client(
  p_programme_id uuid, p_client_id uuid, p_motif text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs';
  end if;

  insert into public.derogations_doublon_client (programme_id, client_id, autorise_par, motif)
  values (p_programme_id, p_client_id, auth.uid(), p_motif)
  on conflict (programme_id, client_id) do update set motif = excluded.motif
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.accorder_derogation_doublon_client(uuid, uuid, text) from public;
grant execute on function public.accorder_derogation_doublon_client(uuid, uuid, text) to authenticated;
