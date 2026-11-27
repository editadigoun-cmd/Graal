-- Aligner la RPC des découvertes sur sa signature avec secteur et sécuriser les nouvelles RPC.
drop function if exists private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,text,text);

create or replace function private.ajouter_nouveau_prescripteur_tournee_impl(
 p_rapport_id uuid,p_nom text,p_centre text,p_specialite public.specialite_client,
 p_potentiel public.potentiel_client,p_secteur public.secteur_code,p_contacts text,p_notes text
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
 if v_secteur is not null and p_secteur is distinct from v_secteur then
   raise exception 'Le secteur du nouveau client doit correspondre à votre secteur.';
 end if;
 if p_secteur is null then raise exception 'Sélectionnez le secteur du nouveau client.'; end if;
 insert into public.tournee_decouvertes(rapport_id,nom,centre,specialite,potentiel,secteur,contacts,notes)
 values(p_rapport_id,trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,
   p_secteur,nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''))
 returning id into v_decouverte;
 insert into public.tournee_rencontres(rapport_id,client_id,nom,centre,specialite,potentiel,telephone,notes,nouveau_prescripteur)
 values(p_rapport_id,null,trim(p_nom),nullif(trim(coalesce(p_centre,'')),''),p_specialite,p_potentiel,
   nullif(trim(coalesce(p_contacts,'')),''),nullif(trim(coalesce(p_notes,'')),''),true);
 return v_decouverte;
end; $$;

create or replace function public.ajouter_nouveau_prescripteur_tournee(
 p_rapport_id uuid,p_nom text,p_centre text,p_specialite public.specialite_client,
 p_potentiel public.potentiel_client,p_secteur public.secteur_code,p_contacts text,p_notes text
) returns uuid language sql security invoker set search_path=public,private as $fn$
 select private.ajouter_nouveau_prescripteur_tournee_impl(
   p_rapport_id,p_nom,p_centre,p_specialite,p_potentiel,p_secteur,p_contacts,p_notes
 );
$fn$;

revoke all on function private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,public.secteur_code,text,text) from anon,public;
grant execute on function private.ajouter_nouveau_prescripteur_tournee_impl(uuid,text,text,public.specialite_client,public.potentiel_client,public.secteur_code,text,text) to authenticated;
revoke all on function public.ajouter_nouveau_prescripteur_tournee(uuid,text,text,public.specialite_client,public.potentiel_client,public.secteur_code,text,text) from anon,public;
grant execute on function public.ajouter_nouveau_prescripteur_tournee(uuid,text,text,public.specialite_client,public.potentiel_client,public.secteur_code,text,text) to authenticated;

revoke all on function public.enregistrer_depart_tournee_gps(uuid,double precision,double precision) from anon,public;
revoke all on function public.enregistrer_cloture_tournee_gps(uuid,double precision,double precision) from anon,public;
revoke all on function public.valider_decouverte_tournee(uuid) from anon,public;
grant execute on function public.enregistrer_depart_tournee_gps(uuid,double precision,double precision) to authenticated;
grant execute on function public.enregistrer_cloture_tournee_gps(uuid,double precision,double precision) to authenticated;
grant execute on function public.valider_decouverte_tournee(uuid) to authenticated;
