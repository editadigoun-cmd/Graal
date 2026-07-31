-- 010b: RPC complémentaires (mode pharmacie uniquement, fusion de secteurs)
-- Réservées au superviseur/administrateur — jamais une action ouverte au VM.

create or replace function public.definir_mode_pharmacie_uniquement(p_programme_id uuid, p_actif boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs';
  end if;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
    set mode_pharmacie_uniquement = p_actif
    where id = p_programme_id and statut = 'BROUILLON';

  if not found then
    raise exception 'Programme introuvable ou déjà soumis';
  end if;
end;
$$;

-- La colonne mode_pharmacie_uniquement n'étant pas un "statut", elle échapperait sinon au
-- verrou de trg_programmes_guard_statut : on la protège explicitement à part.
create or replace function public.trg_programmes_guard_mode_pharmacie()
returns trigger language plpgsql as $$
begin
  if new.mode_pharmacie_uniquement is distinct from old.mode_pharmacie_uniquement
     and coalesce(current_setting('graal.internal_rpc', true), 'off') <> 'on' then
    raise exception 'Le mode "pharmacie uniquement" ne peut être activé que via definir_mode_pharmacie_uniquement()';
  end if;
  return new;
end;
$$;

create trigger programmes_guard_mode_pharmacie
  before update on public.programmes_hebdomadaires
  for each row execute function public.trg_programmes_guard_mode_pharmacie();

create or replace function public.definir_fusion_secteurs(
  p_semaine_debut date, p_potentiels potentiel_client[], p_actif boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not (public.is_admin() or public.is_superviseur()) then
    raise exception 'Action réservée aux superviseurs et administrateurs';
  end if;

  insert into public.fusions_secteurs (semaine_debut, potentiels, cree_par, actif)
  values (p_semaine_debut, p_potentiels, auth.uid(), p_actif)
  returning id into v_id;

  return v_id;
end;
$$;
