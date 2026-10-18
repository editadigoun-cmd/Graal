-- Autoriser un VM à programmer les clients de son portefeuille quel que soit leur secteur.
-- Les contrôles d'accès au portefeuille, statut du programme, activité du client,
-- type de visite et règles de potentiel restent actifs.
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

  -- La contrainte de secteur est supprimée. En dehors d'une fusion,
  -- le client doit toujours appartenir au portefeuille du VM.
  select exists(
    select 1 from public.portefeuille where client_id = new.client_id and vm_id = prog.vm_id
  ) into in_portefeuille;

  if not in_portefeuille and not is_fusion then
    raise exception 'Le client "%" ne fait pas partie du portefeuille de ce VM', cl.nom;
  end if;

  if prog.mode_pharmacie_uniquement and new.type_visite <> 'PHARMACIE' then
    raise exception 'Semaine en mode "pharmacie uniquement" : seules les pharmacies sont programmables';
  end if;

  -- Plafond des clients GROS : 7 le jeudi, 3 le vendredi.
  if cl.potentiel = 'GROS' and new.jour in ('JEUDI', 'VENDREDI') then
    max_gros_jour := case when new.jour = 'JEUDI' then 7 else 3 end;
    select count(*) into nb_gros_jour
      from public.programme_lignes pl
      join public.clients c2 on c2.id = pl.client_id
      where pl.programme_id = new.programme_id
        and pl.jour = new.jour
        and c2.potentiel = 'GROS'
        and pl.id is distinct from new.id;
    if nb_gros_jour >= max_gros_jour then
      raise exception 'Plafond de clients GROS atteint le % : maximum %', new.jour, max_gros_jour;
    end if;
  end if;

  -- Dérogation plafonnée pour les médecins MOYEN lundi/mardi/mercredi.
  if new.type_visite = 'MEDICAL' and cl.potentiel = 'MOYEN' and new.jour in ('LUNDI', 'MARDI', 'MERCREDI') then
    max_moyen_deroge := public.parametre_numeric('nb_max_moyen_lun_mar_mer_jour', 3)::int;
    select count(*) into nb_moyen_deroge
      from public.programme_lignes pl
      join public.clients c2 on c2.id = pl.client_id
      where pl.programme_id = new.programme_id and pl.jour = new.jour
        and pl.type_visite = 'MEDICAL' and c2.potentiel = 'MOYEN'
        and pl.id is distinct from new.id;
    if nb_moyen_deroge >= max_moyen_deroge then
      raise exception 'Dérogation "médecins moyens" épuisée le % : maximum % par jour',
        new.jour, max_moyen_deroge;
    end if;
  elsif not public.potentiel_autorise(new.jour, cl.potentiel) then
    raise exception 'Hiérarchisation non respectée : "%" (potentiel %) n''est pas autorisé le %',
      cl.nom, cl.potentiel, new.jour;
  end if;

  -- Un client ne peut être programmé qu'une fois dans le même programme hebdomadaire,
  -- sauf dérogation administrateur explicite. Une autre semaine reste indépendante.
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
