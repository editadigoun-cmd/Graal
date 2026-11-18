-- Le module commercial ne traite plus les stocks.
-- Les anciennes colonnes sont conservées pour compatibilité/historique, mais la validation
-- des imports ne crée désormais que des ventes.
create or replace function public.valider_import_ventes_ia(p_import_id uuid, p_semaine_debut date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import public.imports_ventes_ia%rowtype;
  v_ligne record;
  v_deja numeric;
  v_delta numeric;
  v_ventes integer := 0;
  v_mois date;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administrateur.';
  end if;
  select * into v_import from public.imports_ventes_ia where id = p_import_id for update;
  if not found then raise exception 'Import introuvable.'; end if;
  if v_import.statut <> 'a_verifier' then raise exception 'Cet import ne peut plus être validé.'; end if;
  if p_semaine_debut is null then raise exception 'Semaine de destination manquante.'; end if;
  v_mois := v_import.mois_reference;
  if v_mois is null then raise exception 'Le mois du relevé doit être confirmé avant validation.'; end if;
  if date_trunc('month', p_semaine_debut)::date <> v_mois then
    raise exception 'La semaine de destination doit appartenir au mois du relevé (%).', to_char(v_mois, 'MM/YYYY');
  end if;

  for v_ligne in
    select l.* from public.lignes_import_ventes_ia l
    join public.produits_pilotage pp on pp.produit_id = l.produit_id and pp.laboratoire_id = v_import.laboratoire_id
    where l.import_id = p_import_id and l.produit_id is not null and l.ventes is not null
  loop
    select coalesce(sum(v.quantite),0) into v_deja
    from public.ventes_hebdomadaires v
    where v.produit_id = v_ligne.produit_id
      and v.grossiste_id = v_import.grossiste_id
      and v.semaine_debut >= v_mois
      and v.semaine_debut < p_semaine_debut;
    v_delta := greatest(0, v_ligne.ventes - v_deja);
    insert into public.ventes_hebdomadaires(produit_id,grossiste_id,semaine_debut,quantite,created_by)
    values(v_ligne.produit_id,v_import.grossiste_id,p_semaine_debut,v_delta,auth.uid())
    on conflict(produit_id,grossiste_id,semaine_debut)
    do update set quantite=excluded.quantite, updated_at=now();
    v_ventes := v_ventes + 1;

    if v_ligne.code_externe is not null and btrim(v_ligne.code_externe) <> '' then
      insert into public.mappings_produits_grossistes(grossiste_id,code_externe,produit_id)
      values(v_import.grossiste_id,v_ligne.code_externe,v_ligne.produit_id)
      on conflict(grossiste_id,code_externe) do update set produit_id=excluded.produit_id;
    end if;
  end loop;

  if v_ventes = 0 then raise exception 'Aucune ligne associée à un produit avec une quantité vendue.'; end if;
  update public.imports_ventes_ia
  set statut='valide', validated_by=auth.uid(), validated_at=now(), updated_at=now()
  where id=p_import_id;
  return jsonb_build_object('ventes',v_ventes,'stocks',0,'statut','valide');
end;
$$;
revoke all on function public.valider_import_ventes_ia(uuid,date) from public;
grant execute on function public.valider_import_ventes_ia(uuid,date) to authenticated;
