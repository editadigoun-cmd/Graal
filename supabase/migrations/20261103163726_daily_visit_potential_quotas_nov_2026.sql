-- Migration 20261103163726: règles quotidiennes de potentiel et plafond journalier.
CREATE OR REPLACE FUNCTION public.potentiel_autorise(p_jour jour_semaine, p_potentiel potentiel_client)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_jour
    when 'LUNDI' then p_potentiel in ('GROS', 'MOYEN')
    when 'MARDI' then p_potentiel in ('GROS', 'MOYEN')
    when 'MERCREDI' then p_potentiel in ('GROS', 'MOYEN')
    when 'JEUDI' then p_potentiel in ('GROS', 'MOYEN', 'FAIBLE')
    when 'VENDREDI' then p_potentiel in ('GROS', 'MOYEN', 'FAIBLE')
  end;
$function$

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

  if not prog.mode_pharmacie_uniquement and not derog_potentiel and not public.is_fawaz_vm(prog.vm_id) then
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

CREATE OR REPLACE FUNCTION public.soumettre_programme_hebdomadaire(p_programme_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  prog record;
  deadline timestamptz;
  deadline_hour text;
  min_medical_jour int;
  min_pharmacie_jour int;
  poids_normal numeric;
  poids_reduit numeric;
  nb_jeudi_faible int;
  nb_jeudi_gros int;
  nb_jeudi_moyen int;
  nb_vendredi_faible int;
  nb_vendredi_gros int;
  nb_vendredi_moyen int;
  v_equipe_id uuid;
  r record;
  rapport jsonb;
begin
  select * into prog from public.programmes_hebdomadaires where id = p_programme_id;
  if prog is null then raise exception 'Programme introuvable'; end if;
  if prog.vm_id <> auth.uid() and not public.is_admin() then raise exception 'Action non autorisée'; end if;
  if prog.statut <> 'BROUILLON' then raise exception 'Programme déjà soumis (statut %)', prog.statut; end if;

  deadline_hour := coalesce(public.parametre_text('heure_limite_soumission_programme', '14:00'), '14:00');
  deadline := (((prog.semaine_debut - 2) + deadline_hour::time)::timestamp at time zone 'Africa/Porto-Novo');
  if prog.delai_supplementaire_jusqu_a is not null and prog.delai_supplementaire_jusqu_a > deadline then
    deadline := prog.delai_supplementaire_jusqu_a;
  end if;

  if now() > deadline and not public.is_admin() then
    insert into public.notifications (profile_id, type, titre, corps, metadata)
    select id, 'SOUMISSION_HORS_DELAI', 'Tentative de soumission hors délai',
      format('%s a tenté de soumettre son programme de la semaine du %s après le délai (samedi %s, heure du Bénin).',
        coalesce((select full_name from public.profiles where id = prog.vm_id), 'Un VM'), prog.semaine_debut, deadline_hour),
      jsonb_build_object('programme_id', prog.id, 'vm_id', prog.vm_id, 'tentative_a', public.benin_now())
    from public.profiles where role = 'admin';
    return jsonb_build_object(
      'statut', 'REJETE_HORS_DELAI',
      'message', format('Délai de soumission dépassé : le programme devait être soumis avant samedi %s (heure du Bénin)', deadline_hour)
    );
  end if;

  if not exists (select 1 from public.programme_lignes where programme_id = p_programme_id) then
    raise exception 'Le programme est vide';
  end if;
  if exists (select 1 from public.programme_lignes where programme_id = p_programme_id group by jour having count(*) > 22) then
    raise exception 'Limite quotidienne dépassée : un VM ne peut pas programmer plus de 22 visites par jour';
  end if;

  if not prog.mode_pharmacie_uniquement and prog.vm_id not in ('e86efe52-ed01-4d04-8eec-e539fd1e4b30'::uuid, 'bb2519e6-04d8-4740-b878-a0b999ad7606'::uuid) then
    min_medical_jour := public.parametre_numeric('visites_minimum_medical_jour', 15);
    min_pharmacie_jour := public.parametre_numeric('visites_minimum_pharmacie_jour', 3);
    poids_normal := case when min_medical_jour > 0 then 100.0 / min_medical_jour else 0 end;
    poids_reduit := public.parametre_numeric('poids_visite_moyen_reduit_pourcentage', 2.5);

    if (select count(distinct jour) from public.programme_lignes where programme_id = p_programme_id) < 5 then
      raise exception 'Le programme doit couvrir les 5 jours de la semaine (Lundi à Vendredi)';
    end if;

    for r in
      select pl.jour,
             count(*) filter (where pl.type_visite = 'MEDICAL') as nb_medical,
             count(*) filter (
               where pl.type_visite = 'MEDICAL' and cl.potentiel = 'MOYEN' and pl.jour in ('LUNDI', 'MARDI', 'MERCREDI')
             ) as nb_medical_moyen_reduit,
             count(*) filter (where pl.type_visite = 'PHARMACIE') as nb_pharmacie
      from public.programme_lignes pl
      join public.clients cl on cl.id = pl.client_id
      where pl.programme_id = p_programme_id
      group by pl.jour
    loop
      if ((r.nb_medical - r.nb_medical_moyen_reduit) * poids_normal + r.nb_medical_moyen_reduit * poids_reduit) < 100 - 0.01
         or (not public.is_fawaz_vm(prog.vm_id) and r.nb_pharmacie < min_pharmacie_jour) then
        raise exception 'Minimum non atteint le % : % pourcent de programmation médicale pondérée, % pharmacies (minimum %)',
          r.jour,
          round(((r.nb_medical - r.nb_medical_moyen_reduit) * poids_normal + r.nb_medical_moyen_reduit * poids_reduit)::numeric, 1),
          r.nb_pharmacie, min_pharmacie_jour;
      end if;
    end loop;
  end if;

  -- Les quotas de potentiel sont contrôlés par le trigger des lignes ; Fawaz conserve son régime autonome.


  select equipe_id into v_equipe_id from public.profiles where id = prog.vm_id;
  delete from public.programme_conformite where programme_id = p_programme_id;
  insert into public.programme_conformite (programme_id, cible, quota_attendu, quantite_programmee, statut)
  select p_programme_id, qc.cible, qc.quota_hebdomadaire, coalesce(cnt.n, 0),
    case when coalesce(cnt.n, 0) = qc.quota_hebdomadaire then 'CONFORME'
         when coalesce(cnt.n, 0) < qc.quota_hebdomadaire then 'SOUS_COUVERT' else 'SUR_COUVERT' end
  from public.quotas_cibles qc
  left join (
    select public.cible_pour_specialite(v_equipe_id, cl.specialite) as cible, count(*) as n
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
    where pl.programme_id = p_programme_id group by 1
  ) cnt on cnt.cible = qc.cible
  where qc.equipe_id = v_equipe_id;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires set statut = 'SOUMIS', soumis_at = now() where id = p_programme_id;

  select jsonb_agg(to_jsonb(pc) - 'id' - 'programme_id') into rapport
    from public.programme_conformite pc where programme_id = p_programme_id;

  return jsonb_build_object('statut', 'SOUMIS', 'conformite', coalesce(rapport, '[]'::jsonb));
end;
$function$
