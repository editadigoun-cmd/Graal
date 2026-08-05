-- Corrige "infinite recursion detected in policy for relation conversation_participants" :
-- la policy participants_select interrogeait conversation_participants (cp2) DANS sa propre
-- clause USING sur conversation_participants, ce qui redéclenche la même policy à l'infini.
-- Confirmé en production (erreurs 500 répétées sur GET .../conversation_participants).
-- Fix standard : passer par une fonction SECURITY DEFINER (contourne RLS pour la vérification
-- d'appartenance), comme is_vm_in_my_scope() le fait déjà ailleurs dans ce fichier.

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id and cp.profile_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

drop policy participants_select on public.conversation_participants;

create policy participants_select on public.conversation_participants for select to authenticated using (
  public.is_admin() or profile_id = auth.uid() or public.is_conversation_participant(conversation_id)
);
