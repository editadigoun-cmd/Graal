-- Autorise les potentiels MOYENS du lundi au mercredi avec un plafond quotidien de 5.
-- Les plafonds des autres potentiels/jours restent inchangés.
create or replace function public.potentiel_autorise(
  p_jour public.jour_semaine,
  p_potentiel public.potentiel_client
)
returns boolean
language sql
immutable
as $function$
  select case p_jour
    when 'LUNDI' then p_potentiel in ('GROS', 'MOYEN')
    when 'MARDI' then p_potentiel in ('GROS', 'MOYEN')
    when 'MERCREDI' then p_potentiel in ('GROS', 'MOYEN')
    when 'JEUDI' then p_potentiel in ('GROS', 'MOYEN', 'FAIBLE')
    when 'VENDREDI' then p_potentiel in ('GROS', 'MOYEN', 'FAIBLE')
  end;
$function$;

insert into public.parametres(key,value,description,updated_at)
values ('nb_max_moyen_lun_mar_mer_jour','5'::jsonb,
        'Nombre maximum de clients à potentiel MOYEN par jour du lundi au mercredi',now())
on conflict (key) do update
set value=excluded.value, description=excluded.description, updated_at=now();

create or replace function public.trg_programme_lignes_validate()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  prog record;
  cl record;
  in_portefeuille boolean;
  nb_moyen_deroge int;
  max_moyen_deroge int;
  derog_zone boolean;
  derog_potentiel boolean;
  derog_specialite boolean;
begin
  select * into prog from public.programmes_hebdomadaires where id = new.programme_id;
  if prog is null then raise exception 'Programme hebdomadaire introuvable'; end if;
  if prog.statut <> 'BROUILLON' then
    raise exception 'Le programme est au statut % : ses lignes ne peuvent plus être modifiées', prog.statut;
  end if;
  select * into cl from public.clients where id = new.client_id;
  if cl is null then raise exception 'Client introuvable'; end if;
  if not cl.actif then raise exception 'Client % désactivé, non programmable', cl.nom; end if;

  select exists (
    select 1 from public.portefeuille
    where client_id = new.client_id and vm_id = prog.vm_id
  ) into in_portefeuille;

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

  if not prog.mode_pharmacie_uniquement and not derog_potentiel then
    if new.type_visite = 'MEDICAL'
       and cl.potentiel = 'MOYEN'
       and new.jour in ('LUNDI', 'MARDI', 'MERCREDI') then
      max_moyen_deroge := public.parametre_numeric('nb_max_moyen_lun_mar_mer_jour', 5)::int;
      select count(*) into nb_moyen_deroge
      from public.programme_lignes pl
      join public.clients c2 on c2.id = pl.client_id
      where pl.programme_id = new.programme_id
        and pl.jour = new.jour
        and pl.type_visite = 'MEDICAL'
        and c2.potentiel = 'MOYEN'
        and pl.id is distinct from new.id;
      if nb_moyen_deroge >= max_moyen_deroge then
        raise exception 'Quota de clients MOYENS atteint le % : maximum % par jour', new.jour, max_moyen_deroge;
      end if;
    elsif not public.potentiel_autorise(new.jour, cl.potentiel) then
      raise exception 'Hiérarchisation non respectée : "%" (potentiel %) n''est pas autorisé le %', cl.nom, cl.potentiel, new.jour;
    end if;
  end if;

  if exists (
    select 1 from public.programme_lignes
    where programme_id = new.programme_id
      and client_id = new.client_id
      and id is distinct from new.id
  ) and not exists (
    select 1 from public.derogations_doublon_client
    where programme_id = new.programme_id and client_id = new.client_id
  ) then
    raise exception 'Le client "%" est déjà programmé cette semaine (dérogation administrateur requise pour un doublon)', cl.nom;
  end if;
  return new;
end;
$function$;
