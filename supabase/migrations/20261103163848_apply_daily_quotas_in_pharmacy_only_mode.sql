-- Migration 20261103163848: appliquer aussi les quotas de potentiel en mode pharmacie uniquement.
CREATE OR REPLACE FUNCTION public.trg_programme_lignes_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  prog record;
  cl record;
  in_portefeuille boolean;
  derog_zone boolean;
  derog_potentiel boolean;
  derog_specialite boolean;
  nb_visites_jour int;
  nb_moyen_jour int;
  nb_gros_jour int;
  nb_faible_jour int;
  max_gros_jour int;
  max_faible_jour int;
  gros_moyen_disponible boolean;
begin
  select * into prog from public.programmes_hebdomadaires where id = new.programme_id;
  if prog is null then raise exception 'Programme hebdomadaire introuvable'; end if;
  if prog.statut <> 'BROUILLON' then
    raise exception 'Le programme est au statut % : ses lignes ne peuvent plus être modifiées', prog.statut;
  end if;
  select * into cl from public.clients where id = new.client_id;
  if cl is null then raise exception 'Client introuvable'; end if;
  if not cl.actif then raise exception 'Client % désactivé, non programmable', cl.nom; end if;

  select exists (select 1 from public.portefeuille where client_id = new.client_id and vm_id = prog.vm_id)
    into in_portefeuille;
  derog_zone := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'ZONE');
  derog_potentiel := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'POTENTIEL');
  derog_specialite := public.derogation_planning_active(prog.vm_id, prog.semaine_debut, 'SPECIALITE:GENERALISTE')
    and cl.specialite = 'GENERALISTE'::public.specialite_client;

  if not in_portefeuille and (not derog_zone or prog.mode_pharmacie_uniquement) and not derog_specialite then
    raise exception 'Le client "%" ne fait pas partie du portefeuille de ce VM', cl.nom;
  end if;
  if prog.mode_pharmacie_uniquement and new.type_visite <> 'PHARMACIE' then
    raise exception 'Semaine en mode "pharmacie uniquement" : seules les pharmacies sont programmables';
  end if;
  if new.type_visite = 'MEDICAL' and cl.specialite = 'PHARMACIE' then
    raise exception 'Type de visite incorrect : une pharmacie doit être ajoutée comme visite PHARMACIE';
  end if;
  if new.type_visite = 'PHARMACIE' and cl.specialite <> 'PHARMACIE' then
    raise exception 'Type de visite incorrect : seuls les clients pharmacie peuvent être ajoutés comme visite PHARMACIE';
  end if;

  select count(*) into nb_visites_jour from public.programme_lignes pl
  where pl.programme_id = new.programme_id and pl.jour = new.jour
    and pl.id is distinct from new.id;
  if nb_visites_jour >= 22 then
    raise exception 'Limite quotidienne atteinte : un VM ne peut pas programmer plus de 22 visites par jour';
  end if;

  if not derog_potentiel and not public.is_fawaz_vm(prog.vm_id) then
    if new.jour in ('LUNDI', 'MARDI', 'MERCREDI') then
      if cl.potentiel = 'FAIBLE' then
        raise exception 'Du lundi au mercredi, seuls les potentiels GROS et MOYEN sont autorisés';
      end if;
      select count(*) into nb_moyen_jour
      from public.programme_lignes pl join public.clients c2 on c2.id = pl.client_id
      where pl.programme_id = new.programme_id and pl.jour = new.jour
        and c2.potentiel = 'MOYEN' and pl.id is distinct from new.id;
      if cl.potentiel = 'MOYEN' and nb_moyen_jour >= 5 then
        raise exception 'Quota MOYEN atteint le % : maximum 5 visites médicales et pharmacies confondues', new.jour;
      end if;
    elsif new.jour in ('JEUDI', 'VENDREDI') then
      max_gros_jour := case when new.jour = 'JEUDI' then 8 else 5 end;
      max_faible_jour := case when new.jour = 'JEUDI' then 2 else 3 end;
      select count(*) filter (where c2.potentiel = 'GROS'),
             count(*) filter (where c2.potentiel = 'FAIBLE')
        into nb_gros_jour, nb_faible_jour
      from public.programme_lignes pl join public.clients c2 on c2.id = pl.client_id
      where pl.programme_id = new.programme_id and pl.jour = new.jour
        and pl.id is distinct from new.id;
      if cl.potentiel = 'GROS' and nb_gros_jour >= max_gros_jour then
        raise exception 'Quota GROS atteint le % : maximum %', new.jour, max_gros_jour;
      end if;
      if cl.potentiel = 'FAIBLE' and nb_faible_jour >= max_faible_jour then
        select exists (
          select 1 from public.portefeuille pf join public.clients c3 on c3.id = pf.client_id
          where pf.vm_id = prog.vm_id and c3.actif and c3.potentiel in ('GROS', 'MOYEN')
            and (derog_zone or c3.secteur is not distinct from prog.secteur)
            and not exists (select 1 from public.programme_lignes pl3
              where pl3.programme_id = new.programme_id and pl3.client_id = c3.id)
        ) into gros_moyen_disponible;
        if gros_moyen_disponible then
          raise exception 'Quota FAIBLE atteint le % : maximum % tant qu''il reste des clients GROS ou MOYEN éligibles dans le portefeuille', new.jour, max_faible_jour;
        end if;
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.programme_lignes
    where programme_id = new.programme_id and client_id = new.client_id
      and id is distinct from new.id
  ) and not exists (
    select 1 from public.derogations_doublon_client
    where programme_id = new.programme_id and client_id = new.client_id
  ) then
    raise exception 'Le client "%" est déjà programmé cette semaine (dérogation administrateur requise pour un doublon)', cl.nom;
  end if;
  return new;
end;
$function$
