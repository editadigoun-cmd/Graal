-- Apply Thursday/Friday visit composition standards.
-- No global 15-visit cap is added; only the per-potential caps below apply.
create or replace function public.trg_programme_lignes_validate()
returns trigger
language plpgsql
as $function$
declare
  prog record;
  cl record;
  vm record;
  in_portefeuille boolean;
  is_fusion boolean;
  nb_moyen_deroge int;
  max_moyen_deroge int;
  nb_gros_jour int;
  max_gros_jour int;
  nb_moyen_jour int;
  max_moyen_jour int;
  nb_faible_jour int;
  max_faible_jour int;
begin
  select * into prog from public.programmes_hebdomadaires where id = new.programme_id;
  if prog is null then
    raise exception 'Programme hebdomadaire introuvable';
  end if;

  if prog.statut <> 'BROUILLON' then
    raise exception 'Le programme est au statut % : ses lignes ne peuvent plus être modifiées', prog.statut;
  end if;

  select * into cl from public.clients where id = new.client_id;
  if cl is null then
    raise exception 'Client introuvable';
  end if;
  if not cl.actif then
    raise exception 'Client % désactivé, non programmable', cl.nom;
  end if;

  select * into vm from public.profiles where id = prog.vm_id;
  is_fusion := public.fusion_active(prog.semaine_debut, cl.potentiel);
  -- Cross-sector scheduling is allowed; portfolio permissions remain enforced.
  select exists(
    select 1 from public.portefeuille where client_id = new.client_id and vm_id = prog.vm_id
  ) into in_portefeuille;

  if not in_portefeuille and not is_fusion then
    raise exception 'Le client "%" ne fait pas partie du portefeuille de ce VM', cl.nom;
  end if;

  if prog.mode_pharmacie_uniquement and new.type_visite <> 'PHARMACIE' then
    raise exception 'Semaine en mode "pharmacie uniquement" : seules les pharmacies sont programmables';
  end if;

  -- Thursday/Friday standards: caps by potential, without a total-visit cap.
  if new.jour in ('JEUDI', 'VENDREDI') then
    max_gros_jour := case when new.jour = 'JEUDI' then 5 else 3 end;
    max_moyen_jour := 7;
    max_faible_jour := case when new.jour = 'JEUDI' then 3 else 5 end;

    select
      count(*) filter (where c2.potentiel = 'GROS')::int,
      count(*) filter (where c2.potentiel = 'MOYEN')::int,
      count(*) filter (where c2.potentiel = 'FAIBLE')::int
    into nb_gros_jour, nb_moyen_jour, nb_faible_jour
    from public.programme_lignes pl
    join public.clients c2 on c2.id = pl.client_id
    where pl.programme_id = new.programme_id
      and pl.jour = new.jour
      and pl.id is distinct from new.id;

    if cl.potentiel = 'GROS' and nb_gros_jour >= max_gros_jour then
      raise exception 'Plafond de clients GROS atteint le % : maximum %', new.jour, max_gros_jour;
    end if;
    if cl.potentiel = 'MOYEN' and nb_moyen_jour >= max_moyen_jour then
      raise exception 'Plafond de clients MOYENS atteint le % : maximum %', new.jour, max_moyen_jour;
    end if;
    if cl.potentiel = 'FAIBLE' and nb_faible_jour >= max_faible_jour then
      raise exception 'Plafond de clients FAIBLES atteint le % : maximum %', new.jour, max_faible_jour;
    end if;

    -- On Friday, weak-potential clients must never outnumber medium-potential clients.
    if new.jour = 'VENDREDI' then
      if cl.potentiel = 'FAIBLE' and (nb_faible_jour + 1) > nb_moyen_jour then
        raise exception 'Le vendredi, les clients FAIBLES ne peuvent pas dépasser les MOYENS.';
      elsif cl.potentiel = 'MOYEN' and nb_faible_jour > (nb_moyen_jour + 1) then
        raise exception 'Le vendredi, les clients FAIBLES ne peuvent pas dépasser les MOYENS.';
      end if;
    end if;
  end if;

  -- Existing Monday/Tuesday/Wednesday medium-potential medical limit.
  if new.type_visite = 'MEDICAL' and cl.potentiel = 'MOYEN' and new.jour in ('LUNDI', 'MARDI', 'MERCREDI') then
    max_moyen_deroge := public.parametre_numeric('nb_max_moyen_lun_mar_mer_jour', 3)::int;
    select count(*) into nb_moyen_deroge
      from public.programme_lignes pl
      join public.clients c2 on c2.id = pl.client_id
      where pl.programme_id = new.programme_id and pl.jour = new.jour
        and pl.type_visite = 'MEDICAL' and c2.potentiel = 'MOYEN'
        and pl.id is distinct from new.id;
    if nb_moyen_deroge >= max_moyen_deroge then
      raise exception 'Dérogation "médecins moyens" épuisée le % : maximum % par jour', new.jour, max_moyen_deroge;
    end if;
  elsif not public.potentiel_autorise(new.jour, cl.potentiel) then
    raise exception 'Hiérarchisation non respectée : "%" (potentiel %) n''est pas autorisé le %',
      cl.nom, cl.potentiel, new.jour;
  end if;

  -- One client per week, unless an explicit admin duplicate waiver exists.
  if exists (
    select 1 from public.programme_lignes
    where programme_id = new.programme_id and client_id = new.client_id
      and id is distinct from new.id
  ) then
    if not exists (
      select 1 from public.derogations_doublon_client
      where programme_id = new.programme_id and client_id = new.client_id
    ) then
      raise exception 'Le client "%" est déjà programmé cette semaine (dérogation administrateur requise pour un doublon)', cl.nom;
    end if;
  end if;

  return new;
end;
$function$;
