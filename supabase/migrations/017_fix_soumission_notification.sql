-- 017: corrige la perte de la notification "soumission hors délai"
-- (un RAISE EXCEPTION annule toute la transaction, y compris l'INSERT de notification
-- qui le précède ; on retourne donc un statut d'échec explicite plutôt que de lever une exception)

create or replace function public.soumettre_programme_hebdomadaire(p_programme_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prog record;
  deadline timestamp;
  min_medical_jour int;
  min_pharmacie_jour int;
  nb_jeudi_total int;
  nb_jeudi_faible int;
  seuil_faible numeric;
  ratio_faible numeric;
  r record;
  rapport jsonb;
begin
  select * into prog from public.programmes_hebdomadaires where id = p_programme_id;
  if prog is null then
    raise exception 'Programme introuvable';
  end if;
  if prog.vm_id <> auth.uid() and not public.is_admin() then
    raise exception 'Action non autorisée';
  end if;
  if prog.statut <> 'BROUILLON' then
    raise exception 'Programme déjà soumis (statut %)', prog.statut;
  end if;

  deadline := (prog.semaine_debut - 4) + time '21:00';

  if public.benin_now() > deadline and not public.is_admin() then
    insert into public.notifications (profile_id, type, titre, corps, metadata)
    select id, 'SOUMISSION_HORS_DELAI', 'Tentative de soumission hors délai',
      format('%s a tenté de soumettre son programme de la semaine du %s après le délai (jeudi 21h, heure du Bénin).',
        coalesce((select full_name from public.profiles where id = prog.vm_id), 'Un VM'), prog.semaine_debut),
      jsonb_build_object('programme_id', prog.id, 'vm_id', prog.vm_id, 'tentative_a', public.benin_now())
    from public.profiles where role = 'admin';

    return jsonb_build_object(
      'statut', 'REJETE_HORS_DELAI',
      'message', 'Délai de soumission dépassé : le programme devait être soumis avant jeudi 21h00 (heure du Bénin)'
    );
  end if;

  if not exists (select 1 from public.programme_lignes where programme_id = p_programme_id) then
    raise exception 'Le programme est vide';
  end if;

  if not prog.mode_pharmacie_uniquement then
    min_medical_jour := public.parametre_numeric('visites_minimum_medical_jour', 15);
    min_pharmacie_jour := public.parametre_numeric('visites_minimum_pharmacie_jour', 3);

    if (select count(distinct jour) from public.programme_lignes where programme_id = p_programme_id) < 5 then
      raise exception 'Le programme doit couvrir les 5 jours de la semaine (Lundi à Vendredi)';
    end if;

    for r in
      select jour,
             count(*) filter (where type_visite = 'MEDICAL') as nb_medical,
             count(*) filter (where type_visite = 'PHARMACIE') as nb_pharmacie
      from public.programme_lignes
      where programme_id = p_programme_id
      group by jour
    loop
      if r.nb_medical < min_medical_jour or r.nb_pharmacie < min_pharmacie_jour then
        raise exception 'Minimum non atteint le % : % visites médicales (minimum %), % pharmacies (minimum %)',
          r.jour, r.nb_medical, min_medical_jour, r.nb_pharmacie, min_pharmacie_jour;
      end if;
    end loop;
  end if;

  select count(*) filter (where cl.potentiel = 'FAIBLE'), count(*)
    into nb_jeudi_faible, nb_jeudi_total
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
    where pl.programme_id = p_programme_id and pl.jour = 'JEUDI';

  seuil_faible := public.parametre_numeric('seuil_faible_jeudi_pourcentage_max', 50) / 100.0;

  if nb_jeudi_total > 0 then
    ratio_faible := nb_jeudi_faible::numeric / nb_jeudi_total;
    if ratio_faible > seuil_faible then
      raise exception 'Part de clients FAIBLE le jeudi trop élevée : %s%% programmés (maximum autorisé %s%%)',
        round(ratio_faible * 100), round(seuil_faible * 100);
    end if;
  end if;

  delete from public.programme_conformite where programme_id = p_programme_id;
  insert into public.programme_conformite (programme_id, cible, quota_attendu, quantite_programmee, statut)
  select p_programme_id, qc.cible, qc.quota_hebdomadaire, coalesce(cnt.n, 0),
    case
      when coalesce(cnt.n, 0) = qc.quota_hebdomadaire then 'CONFORME'
      when coalesce(cnt.n, 0) < qc.quota_hebdomadaire then 'SOUS_COUVERT'
      else 'SUR_COUVERT'
    end
  from public.quotas_cibles qc
  left join (
    select public.cible_pour_specialite(cl.specialite) as cible, count(*) as n
    from public.programme_lignes pl join public.clients cl on cl.id = pl.client_id
    where pl.programme_id = p_programme_id
    group by 1
  ) cnt on cnt.cible = qc.cible;

  perform set_config('graal.internal_rpc', 'on', true);
  update public.programmes_hebdomadaires
    set statut = 'SOUMIS', soumis_at = now()
    where id = p_programme_id;

  select jsonb_agg(to_jsonb(pc) - 'id' - 'programme_id') into rapport
    from public.programme_conformite pc where programme_id = p_programme_id;

  return jsonb_build_object('statut', 'SOUMIS', 'conformite', coalesce(rapport, '[]'::jsonb));
end;
$$;
