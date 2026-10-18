-- Reapply the corrected submission validator definition to keep migration history aligned with the live database.
-- Validate Thursday/Friday visit composition when submitting a weekly plan.
create or replace function public.soumettre_programme_hebdomadaire(p_programme_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  prog record;
  deadline timestamp;
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
  deadline := ((prog.semaine_debut - 2) + deadline_hour::time)::timestamp;
  if prog.delai_supplementaire_jusqu_a is not null and prog.delai_supplementaire_jusqu_a > deadline then
    deadline := prog.delai_supplementaire_jusqu_a;
  end if;

  if public.benin_now() > deadline and not public.is_admin() then
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

  if not prog.mode_pharmacie_uniquement then
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
         or r.nb_pharmacie < min_pharmacie_jour then
        raise exception 'Minimum non atteint le % : % pourcent de programmation médicale pondérée, % pharmacies (minimum %)',
          r.jour,
          round(((r.nb_medical - r.nb_medical_moyen_reduit) * poids_normal + r.nb_medical_moyen_reduit * poids_reduit)::numeric, 1),
          r.nb_pharmacie, min_pharmacie_jour;
      end if;
    end loop;
  end if;

  -- Thursday: maximum 5 GROS, 7 MOYEN, 3 FAIBLE.
  select count(*) filter (where cl.potentiel = 'GROS'),
         count(*) filter (where cl.potentiel = 'MOYEN'),
         count(*) filter (where cl.potentiel = 'FAIBLE')
    into nb_jeudi_gros, nb_jeudi_moyen, nb_jeudi_faible
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
   where pl.programme_id = p_programme_id and pl.jour = 'JEUDI';

  if nb_jeudi_gros > 5 or nb_jeudi_moyen > 7 or nb_jeudi_faible > 3 then
    raise exception 'Standards du jeudi dépassés : maximum 5 GROS, 7 MOYENS et 3 FAIBLES.';
  end if;

  -- Friday: maximum 3 GROS, 7 MOYEN, 5 FAIBLE; FAIBLE cannot outnumber MOYEN.
  select count(*) filter (where cl.potentiel = 'GROS'),
         count(*) filter (where cl.potentiel = 'MOYEN'),
         count(*) filter (where cl.potentiel = 'FAIBLE')
    into nb_vendredi_gros, nb_vendredi_moyen, nb_vendredi_faible
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
   where pl.programme_id = p_programme_id and pl.jour = 'VENDREDI';

  if nb_vendredi_gros > 3 or nb_vendredi_moyen > 7 or nb_vendredi_faible > 5 then
    raise exception 'Standards du vendredi dépassés : maximum 3 GROS, 7 MOYENS et 5 FAIBLES.';
  end if;
  if nb_vendredi_faible > nb_vendredi_moyen then
    raise exception 'Le vendredi, les clients FAIBLES ne peuvent pas dépasser les MOYENS.';
  end if;

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
$function$;
