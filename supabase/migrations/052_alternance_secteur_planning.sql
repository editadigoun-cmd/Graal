-- Store the intended sector on each weekly programme and alternate it week by week.
alter table public.programmes_hebdomadaires
  add column if not exists secteur public.secteur_code;

with programme_sector as (
  select p.id,
         (select c.secteur
          from public.programme_lignes pl
          join public.clients c on c.id = pl.client_id
          where pl.programme_id = p.id and c.secteur is not null
          group by c.secteur
          order by count(*) desc, c.secteur
          limit 1) as ligne_secteur
  from public.programmes_hebdomadaires p
),
previous_sector as (
  select p.id,
         (select prev.secteur
          from public.programmes_hebdomadaires prev
          where prev.vm_id = p.vm_id
            and prev.semaine_debut < p.semaine_debut
            and prev.secteur is not null
          order by prev.semaine_debut desc
          limit 1) as secteur_precedent
  from public.programmes_hebdomadaires p
)
update public.programmes_hebdomadaires p
set secteur = coalesce(
  ps.ligne_secteur,
  case prev.secteur_precedent
    when 'A' then 'B'::public.secteur_code
    when 'B' then 'A'::public.secteur_code
    else null
  end,
  case prof.secteur
    when 'A' then 'B'::public.secteur_code
    when 'B' then 'A'::public.secteur_code
    else null
  end
)
from programme_sector ps
join previous_sector prev on prev.id = ps.id
left join public.profiles prof
  on prof.id = (select p2.vm_id from public.programmes_hebdomadaires p2 where p2.id = ps.id)
where p.id = ps.id and p.secteur is null;

 
-- Enforce the weekly programme's sector (rather than the profile's current sector),
-- and keep visit type aligned with medical/pharmacy clients.
create or replace function public.trg_programme_lignes_validate()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  prog record;
  cl record;
  vm record;
  in_portefeuille boolean;
  is_fusion boolean;
  nb_moyen_deroge int;
  max_moyen_deroge int;
  secteur_programme public.secteur_code;
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
  secteur_programme := coalesce(prog.secteur, vm.secteur);
  is_fusion := public.fusion_active(prog.semaine_debut, cl.potentiel);

  if not is_fusion and cl.secteur is distinct from secteur_programme then
    raise exception 'Verrouillage sectoriel : le client "%" appartient au secteur %, le programme de ce VM est en secteur %',
      cl.nom, cl.secteur, secteur_programme;
  end if;

  select exists(
    select 1 from public.portefeuille where client_id = new.client_id and vm_id = prog.vm_id
  ) into in_portefeuille;

  if not in_portefeuille and not is_fusion then
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
