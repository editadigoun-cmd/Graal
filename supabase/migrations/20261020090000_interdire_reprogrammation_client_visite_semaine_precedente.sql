-- Bloque la programmation d'un client réellement visité par le même VM la semaine précédente.
-- Une visite NON_FAITE n'est pas bloquante : le client peut être reprogrammé.
create or replace function public.client_deja_vu_semaine_precedente(
  p_vm_id uuid,
  p_client_id uuid,
  p_semaine_cible date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.visites v
    where v.vm_id = p_vm_id
      and v.client_id = p_client_id
      and v.jour >= p_semaine_cible - 7
      and v.jour < p_semaine_cible
      and v.statut in ('REALISEE', 'HORS_PROGRAMME')
  );
$$;

-- Ajouter le contrôle à la validation DB déjà en place sans écraser les autres règles métier.
do $$
declare
  def text;
  anchor text;
  replacement text;
begin
  def := pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure);
  if position('client_deja_vu_semaine_precedente' in def) = 0 then
    anchor := '  select * into vm from public.profiles where id = prog.vm_id;' || chr(10);
    replacement := anchor
      || '  if public.client_deja_vu_semaine_precedente(prog.vm_id, new.client_id, prog.semaine_debut) then' || chr(10)
      || '    raise exception ''Client déjà visité par ce VM la semaine précédente ; reprogrammation autorisée la semaine suivante.'';' || chr(10)
      || '  end if;' || chr(10);
    if position(anchor in def) = 0 then
      raise exception 'Point d''insertion introuvable dans trg_programme_lignes_validate()';
    end if;
    def := replace(def, anchor, replacement);
    execute def;
  end if;
end;
$$;
