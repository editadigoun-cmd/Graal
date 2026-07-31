-- 011: Row Level Security — cloisonnement par rôle, secteur et équipe.
-- Principe : aucune table métier n'est accessible en écriture libre depuis le client
-- quand une fonction dédiée (RPC SECURITY DEFINER) existe pour l'opération concernée.

alter table public.equipes enable row level security;
alter table public.profiles enable row level security;
alter table public.superviseur_equipes enable row level security;
alter table public.clients enable row level security;
alter table public.portefeuille enable row level security;
alter table public.produits enable row level security;
alter table public.imports_portefeuille enable row level security;
alter table public.programmes_hebdomadaires enable row level security;
alter table public.derogations_doublon_client enable row level security;
alter table public.fusions_secteurs enable row level security;
alter table public.programme_lignes enable row level security;
alter table public.programme_conformite enable row level security;
alter table public.motifs_non_visite enable row level security;
alter table public.visites enable row level security;
alter table public.visite_produits enable row level security;
alter table public.visite_manquante_motifs enable row level security;
alter table public.clotures_journalieres enable row level security;
alter table public.reporting_hebdomadaire enable row level security;
alter table public.rapports_duo enable row level security;
alter table public.plans_activites_mensuels enable row level security;
alter table public.parametres enable row level security;
alter table public.quotas_cibles enable row level security;
alter table public.cible_specialite_map enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_lectures enable row level security;
alter table public.notifications enable row level security;

-- ===================== équipes / superviseur_equipes =====================

create policy equipes_select on public.equipes for select to authenticated using (true);
create policy equipes_write on public.equipes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy superviseur_equipes_select on public.superviseur_equipes for select to authenticated using (true);
create policy superviseur_equipes_write on public.superviseur_equipes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===================== profiles =====================

create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or role in ('superviseur', 'admin')
  or (public.is_superviseur() and equipe_id in (select public.supervised_equipe_ids()))
);

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy profiles_insert_admin on public.profiles for insert to authenticated
  with check (public.is_admin());

-- ===================== clients / portefeuille =====================

create policy clients_select on public.clients for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.portefeuille p where p.client_id = clients.id and p.vm_id = auth.uid())
  or (public.is_superviseur() and exists (
        select 1 from public.portefeuille p join public.profiles vm on vm.id = p.vm_id
        where p.client_id = clients.id and vm.equipe_id in (select public.supervised_equipe_ids())
      ))
  or (public.current_role() = 'vm' and exists (
        select 1 from public.fusions_secteurs fs where fs.actif and clients.potentiel = any(fs.potentiels)
      ))
);

create policy clients_write on public.clients for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy portefeuille_select on public.portefeuille for select to authenticated using (
  public.is_admin()
  or vm_id = auth.uid()
  or (public.is_superviseur() and exists (
        select 1 from public.profiles vm where vm.id = portefeuille.vm_id
          and vm.equipe_id in (select public.supervised_equipe_ids())
      ))
);

create policy portefeuille_write on public.portefeuille for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy produits_select on public.produits for select to authenticated using (true);
create policy produits_write on public.produits for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy imports_portefeuille_all on public.imports_portefeuille for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===================== programmes & lignes =====================

create policy programmes_select on public.programmes_hebdomadaires for select to authenticated using (
  public.is_admin() or vm_id = auth.uid() or public.is_vm_in_my_scope(vm_id)
);

create policy programmes_insert on public.programmes_hebdomadaires for insert to authenticated
  with check (vm_id = auth.uid() or public.is_admin());

create policy programmes_delete_brouillon on public.programmes_hebdomadaires for delete to authenticated
  using ((vm_id = auth.uid() and statut = 'BROUILLON') or public.is_admin());

-- Aucune policy UPDATE générale : tout changement de statut passe par les RPC dédiées
-- (soumettre_programme_hebdomadaire / valider_programme_hebdomadaire / rejeter_programme_hebdomadaire /
-- definir_mode_pharmacie_uniquement), exécutées en SECURITY DEFINER.

create policy derogations_select on public.derogations_doublon_client for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.programmes_hebdomadaires ph
    where ph.id = derogations_doublon_client.programme_id and (ph.vm_id = auth.uid() or public.is_vm_in_my_scope(ph.vm_id))
  )
);
create policy derogations_write on public.derogations_doublon_client for insert to authenticated
  with check (public.is_admin());

create policy fusions_select on public.fusions_secteurs for select to authenticated using (true);
create policy fusions_write on public.fusions_secteurs for all to authenticated
  using (public.is_admin() or public.is_superviseur())
  with check (public.is_admin() or public.is_superviseur());

create policy programme_lignes_select on public.programme_lignes for select to authenticated using (
  exists (
    select 1 from public.programmes_hebdomadaires ph
    where ph.id = programme_lignes.programme_id
      and (ph.vm_id = auth.uid() or public.is_admin() or public.is_vm_in_my_scope(ph.vm_id))
  )
);

create policy programme_lignes_insert on public.programme_lignes for insert to authenticated
  with check (
    exists (
      select 1 from public.programmes_hebdomadaires ph
      where ph.id = programme_lignes.programme_id and ph.statut = 'BROUILLON'
        and (ph.vm_id = auth.uid() or public.is_admin())
    )
  );

create policy programme_lignes_update on public.programme_lignes for update to authenticated
  using (
    exists (
      select 1 from public.programmes_hebdomadaires ph
      where ph.id = programme_lignes.programme_id and ph.statut = 'BROUILLON'
        and (ph.vm_id = auth.uid() or public.is_admin())
    )
  );

create policy programme_lignes_delete on public.programme_lignes for delete to authenticated
  using (
    exists (
      select 1 from public.programmes_hebdomadaires ph
      where ph.id = programme_lignes.programme_id and ph.statut = 'BROUILLON'
        and (ph.vm_id = auth.uid() or public.is_admin())
    )
  );

create policy programme_conformite_select on public.programme_conformite for select to authenticated using (
  exists (
    select 1 from public.programmes_hebdomadaires ph
    where ph.id = programme_conformite.programme_id
      and (ph.vm_id = auth.uid() or public.is_admin() or public.is_vm_in_my_scope(ph.vm_id))
  )
);

-- ===================== motifs, visites =====================

create policy motifs_select on public.motifs_non_visite for select to authenticated using (true);
create policy motifs_write on public.motifs_non_visite for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy visites_select on public.visites for select to authenticated using (
  public.is_admin() or vm_id = auth.uid() or public.is_vm_in_my_scope(vm_id)
);

create policy visites_insert on public.visites for insert to authenticated
  with check (vm_id = auth.uid());

create policy visite_produits_select on public.visite_produits for select to authenticated using (
  exists (
    select 1 from public.visites v where v.id = visite_produits.visite_id
      and (v.vm_id = auth.uid() or public.is_admin() or public.is_vm_in_my_scope(v.vm_id))
  )
);

create policy visite_produits_insert on public.visite_produits for insert to authenticated
  with check (
    exists (select 1 from public.visites v where v.id = visite_produits.visite_id and v.vm_id = auth.uid())
  );

create policy manquante_motifs_select on public.visite_manquante_motifs for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.programme_lignes pl join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
    where pl.id = visite_manquante_motifs.programme_ligne_id
      and (ph.vm_id = auth.uid() or public.is_vm_in_my_scope(ph.vm_id))
  )
);

create policy manquante_motifs_insert on public.visite_manquante_motifs for insert to authenticated
  with check (
    public.is_admin() or exists (
      select 1 from public.programme_lignes pl join public.programmes_hebdomadaires ph on ph.id = pl.programme_id
      where pl.id = visite_manquante_motifs.programme_ligne_id and ph.vm_id = auth.uid()
    )
  );

-- ===================== clôtures =====================
-- Aucune policy INSERT/UPDATE pour les utilisateurs standards : toute écriture passe par
-- cloturer_journee() ou le job planifié forcer_clotures_du_jour() (SECURITY DEFINER, bypass RLS).

create policy clotures_select on public.clotures_journalieres for select to authenticated using (
  public.is_admin() or vm_id = auth.uid() or public.is_vm_in_my_scope(vm_id)
);

-- ===================== reporting & coaching =====================

create or replace function public.trg_reporting_guard_visa()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and (new.visa_superviseur_id, new.appreciation_superviseur, new.recommandations_superviseur)
         is distinct from (old.visa_superviseur_id, old.appreciation_superviseur, old.recommandations_superviseur)
     and not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Seul un superviseur peut viser le reporting hebdomadaire';
  end if;
  if new.visa_superviseur_id is not null and old.visa_superviseur_id is null then
    new.visa_horodatage := now();
  end if;
  return new;
end;
$$;

create trigger reporting_guard_visa
  before update on public.reporting_hebdomadaire
  for each row execute function public.trg_reporting_guard_visa();

create policy reporting_select on public.reporting_hebdomadaire for select to authenticated using (
  public.is_admin() or vm_id = auth.uid() or public.is_vm_in_my_scope(vm_id)
);

create policy reporting_insert on public.reporting_hebdomadaire for insert to authenticated
  with check (vm_id = auth.uid() or public.is_admin());

create policy reporting_update on public.reporting_hebdomadaire for update to authenticated
  using (vm_id = auth.uid() or public.is_admin() or public.is_vm_in_my_scope(vm_id));

create policy rapports_duo_select on public.rapports_duo for select to authenticated using (
  public.is_admin() or superviseur_id = auth.uid() or vm_id = auth.uid() or public.is_vm_in_my_scope(vm_id)
);

create policy rapports_duo_insert on public.rapports_duo for insert to authenticated
  with check (superviseur_id = auth.uid() and (public.is_superviseur() or public.is_admin()));

create policy plans_activites_select on public.plans_activites_mensuels for select to authenticated using (true);

create policy plans_activites_insert on public.plans_activites_mensuels for insert to authenticated
  with check (
    (public.is_superviseur() and superviseur_id = auth.uid() and equipe_id in (select public.supervised_equipe_ids()))
    or public.is_admin()
  );

-- ===================== paramètres & quotas =====================

create policy parametres_select on public.parametres for select to authenticated using (true);
create policy parametres_write on public.parametres for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy quotas_select on public.quotas_cibles for select to authenticated using (true);
create policy quotas_write on public.quotas_cibles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy cible_map_select on public.cible_specialite_map for select to authenticated using (true);
create policy cible_map_write on public.cible_specialite_map for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===================== messagerie =====================

create policy conversations_select on public.conversations for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.conversation_participants cp where cp.conversation_id = conversations.id and cp.profile_id = auth.uid()
  )
);
create policy conversations_insert on public.conversations for insert to authenticated
  with check (created_by = auth.uid());

create policy participants_select on public.conversation_participants for select to authenticated using (
  public.is_admin() or profile_id = auth.uid() or exists (
    select 1 from public.conversation_participants cp2
    where cp2.conversation_id = conversation_participants.conversation_id and cp2.profile_id = auth.uid()
  )
);
create policy participants_insert on public.conversation_participants for insert to authenticated
  with check (
    profile_id = auth.uid()
    or exists (select 1 from public.conversations c where c.id = conversation_id and c.created_by = auth.uid())
    or public.is_admin()
  );

create policy messages_select on public.messages for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.profile_id = auth.uid()
  )
);
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid() and exists (
      select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.profile_id = auth.uid()
    )
  );

create policy message_lectures_select on public.message_lectures for select to authenticated using (profile_id = auth.uid() or public.is_admin());
create policy message_lectures_insert on public.message_lectures for insert to authenticated with check (profile_id = auth.uid());

-- ===================== notifications =====================

create policy notifications_select on public.notifications for select to authenticated using (
  profile_id = auth.uid() or public.is_admin()
);
create policy notifications_update on public.notifications for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ===================== stockage (photos fiches papier / messagerie) =====================

create policy storage_fiches_papier_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fiches-papier' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy storage_fiches_papier_read on storage.objects for select to authenticated
  using (
    bucket_id = 'fiches-papier' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or public.is_vm_in_my_scope(((storage.foldername(name))[1])::uuid)
    )
  );

create policy storage_messagerie_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'messagerie' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy storage_messagerie_read on storage.objects for select to authenticated
  using (bucket_id = 'messagerie');
