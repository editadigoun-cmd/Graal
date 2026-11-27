-- Autoriser les VM sans portefeuille initial à déclarer des clients découverts.
create or replace function private.ajouter_nouveau_prescripteur_tournee_impl(
 p_rapport_id uuid,p_nom text,p_centre text,p_specialite public.specialite_client,
 p_potentiel public.potentiel_client,p_contacts text,p_notes text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
 v_tournee public.tournees%rowtype;
 v_secteur public.secteur_code;
 v_decouverte uuid;
begin
 select t.* into v_tournee
 from public.tournee_rapports r
 join public.tournee_jours j on j.id=r.tournee_jour_id
 join public.tournees t on t.id=j.tournee_id
 where r.id=p_rapport_id and r.soumis_at is null
   and t.demandeur_id=auth.uid() and t.statut='EN_COURS'
   and j.statut in ('EN_COURS','EFFECTUEE');
 if not found then raise exception 'Ajout réservé à une journée de tournée active.'; end if;
 if nullif(trim(p_nom),'') is null or p_specialite is null or p_potentiel is null then
   raise exception 'Nom, spécialité et potentiel sont obligatoires.';
 end if;
 select secteur into v_secteur from public.profiles where id=auth.uid();
 if v_secteur is null then raise exception 'Votre secteur n’est pas renseigné.'; end if;
 insert into public.tournee_decouvertes(rapport_id,nom,centre,specialite,potentiel,secteur,contacts,notes)
 values(p_rapport_id,trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,
   v_secteur,nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''))
 returning id into v_decouverte;
 insert into public.tournee_rencontres(rapport_id,client_id,nom,centre,specialite,potentiel,telephone,notes,nouveau_prescripteur)
 values(p_rapport_id,null,trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,
   nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''),true);
 return v_decouverte;
end; $$;
