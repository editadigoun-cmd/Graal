drop function if exists public.ajouter_nouveau_prescripteur_tournee(uuid,text,text,public.specialite_client,public.potentiel_client,text,text);
drop function if exists private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,text,text);

create function private.ajouter_nouveau_prescripteur_tournee_impl(
 p_rapport_id uuid,p_nom text,p_centre text,p_specialite public.specialite_client,p_potentiel public.potentiel_client,p_secteur public.secteur_code,p_contacts text,p_notes text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_tournee public.tournees%rowtype; v_client uuid; v_secteur public.secteur_code;
begin
 select t.* into v_tournee from public.tournee_rapports r join public.tournee_jours j on j.id=r.tournee_jour_id join public.tournees t on t.id=j.tournee_id
 where r.id=p_rapport_id and r.soumis_at is null and t.demandeur_id=auth.uid() and t.avec_portefeuille and t.statut='EN_COURS';
 if not found then raise exception 'Ajout réservé à une tournée active avec portefeuille.'; end if;
 if nullif(trim(p_nom),'') is null or p_specialite is null or p_potentiel is null then raise exception 'Nom, spécialité et potentiel sont obligatoires.'; end if;
 select secteur into v_secteur from public.profiles where id=auth.uid();
 if v_secteur is not null and p_secteur is distinct from v_secteur then raise exception 'Le secteur du nouveau prescripteur doit correspondre à votre secteur.'; end if;
 if p_secteur is null then raise exception 'Sélectionnez le secteur du nouveau prescripteur.'; end if;
 insert into public.clients(nom,centre,specialite,potentiel,secteur,contacts,observations,frequence_visite_mensuelle)
 values(trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,p_secteur,nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''),public.default_frequence(p_potentiel))
 returning id into v_client;
 insert into public.portefeuille(client_id,vm_id) values(v_client,auth.uid());
 insert into public.tournee_rencontres(rapport_id,client_id,nom,centre,specialite,potentiel,telephone,notes,nouveau_prescripteur)
 values(p_rapport_id,v_client,trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''),true);
 return v_client;
end; $$;
revoke all on function private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,public.secteur_code,text,text) from anon,public;
grant execute on function private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,public.secteur_code,text,text) to authenticated;
create function public.ajouter_nouveau_prescripteur_tournee(p_rapport_id uuid,p_nom text,p_centre text,p_specialite public.specialite_client,p_potentiel public.potentiel_client,p_secteur public.secteur_code,p_contacts text,p_notes text)
returns uuid language sql security invoker set search_path=public,private as $fn$ select private.ajouter_nouveau_prescripteur_tournee_impl(p_rapport_id,p_nom,p_centre,p_specialite,p_potentiel,p_secteur,p_contacts,p_notes); $fn$;
revoke all on function public.ajouter_nouveau_prescripteur_tournee(uuid,text,text,public.specialite_client,public.potentiel_client,public.secteur_code,text,text) from anon,public;
grant execute on function public.ajouter_nouveau_prescripteur_tournee(uuid,text,text,public.specialite_client,public.potentiel_client,public.secteur_code,text,text) to authenticated;
