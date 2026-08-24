-- 043: Quota hebdomadaire pondéré — dérogation limitée "médecins moyens" lundi/mardi/mercredi.
--
-- Jusqu'ici potentiel_autorise() bloquait strictement les médecins "MOYEN" le lundi et le
-- mardi (réservés aux "GROS"), et les autorisait sans limite le mercredi. Le minimum quotidien
-- (visites_minimum_medical_jour, 15 par défaut = 100%) était un simple comptage brut de lignes.
--
-- Nouvelle règle, décidée par l'administrateur : sur ces 3 jours, quelques créneaux "moyens"
-- sont désormais tolérés (par défaut 3/jour) pour faciliter l'équilibrage des programmes des
-- délégués, mais chacun ne compte que pour un poids réduit dans le quota (2,5% par défaut,
-- contre ~6,66% pour une visite normale sur la base de 15/jour) — pour ne pas laisser la main
-- aux délégués pour multiplier les "moyens" au détriment des "gros".

insert into public.parametres (key, value, description) values
  ('nb_max_moyen_lun_mar_mer_jour', '3',
   'Nombre maximum de médecins "moyens" programmables par jour le lundi/mardi/mercredi (dérogation limitée)'),
  ('poids_visite_moyen_reduit_pourcentage', '2.5',
   'Poids (%) d''une visite "médecin moyen" lundi/mardi/mercredi dans le quota quotidien, au lieu du poids normal')
on conflict (key) do nothing;

-- ============================================================
-- trg_programme_lignes_validate() : dérogation plafonnée avant le contrôle de hiérarchisation
-- ============================================================
create or replace function public.trg_programme_lignes_validate()
returns trigger language plpgsql as $$
declare
  prog record;
  cl record;
  vm record;
  in_portefeuille boolean;
  is_fusion boolean;
  nb_moyen_deroge int;
  max_moyen_deroge int;
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

  -- Verrouillage sectoriel : filtrage structurel, non contournable
  if not is_fusion and cl.secteur is distinct from vm.secteur then
    raise exception 'Verrouillage sectoriel : le client "%" appartient au secteur %, ce VM est affecté au secteur %',
      cl.nom, cl.secteur, vm.secteur;
  end if;

  select exists(
    select 1 from public.portefeuille where client_id = new.client_id and vm_id = prog.vm_id
  ) into in_portefeuille;

  if not in_portefeuille and not is_fusion then
    raise exception 'Le client "%" ne fait pas partie du portefeuille de ce VM', cl.nom;
  end if;

  -- Mode "semaine dédiée pharmacie"
  if prog.mode_pharmacie_uniquement and new.type_visite <> 'PHARMACIE' then
    raise exception 'Semaine en mode "pharmacie uniquement" : seules les pharmacies sont programmables';
  end if;

  -- Hiérarchisation stricte par potentiel / jour — avec dérogation plafonnée pour les médecins
  -- "moyens" le lundi/mardi/mercredi (poids réduit appliqué au quota, cf.
  -- soumettre_programme_hebdomadaire)
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

  -- Un client ne peut être programmé qu'une fois par semaine, sauf dérogation admin explicite
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
$$;

-- ============================================================
-- soumettre_programme_hebdomadaire() : quota quotidien pondéré (% au lieu du comptage brut)
-- ============================================================
create or replace function public.soumettre_programme_hebdomadaire(p_programme_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  prog record;
  deadline timestamp;
  min_medical_jour int;
  min_pharmacie_jour int;
  poids_normal numeric;
  poids_reduit numeric;
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
  if prog.delai_supplementaire_jusqu_a is not null and prog.delai_supplementaire_jusqu_a > deadline then
    deadline := prog.delai_supplementaire_jusqu_a;
  end if;

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
      if (
        (r.nb_medical - r.nb_medical_moyen_reduit) * poids_normal + r.nb_medical_moyen_reduit * poids_reduit
      ) < 100 - 0.01 or r.nb_pharmacie < min_pharmacie_jour then
        raise exception 'Minimum non atteint le % : % pourcent de programmation médicale pondérée (minimum 100%%, dont % médecin(s) "moyen" à poids réduit), % pharmacies (minimum %)',
          r.jour,
          round(((r.nb_medical - r.nb_medical_moyen_reduit) * poids_normal + r.nb_medical_moyen_reduit * poids_reduit)::numeric, 1),
          r.nb_medical_moyen_reduit, r.nb_pharmacie, min_pharmacie_jour;
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
