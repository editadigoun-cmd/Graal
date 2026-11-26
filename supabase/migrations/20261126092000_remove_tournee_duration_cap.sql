create or replace function private.demander_tournee_impl(p_zone text,p_date_debut date,p_date_fin date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_role public.user_role; v_avec_portefeuille boolean;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select role into v_role from public.profiles where id=auth.uid() and actif;
  if v_role <> 'vm' then raise exception 'Seuls les VM peuvent demander une tournée.'; end if;
  if nullif(trim(p_zone),'') is null or p_date_debut is null or p_date_fin is null or p_date_fin < p_date_debut or p_date_debut < public.benin_today() then
    raise exception 'Vérifiez la zone et les dates de la tournée.';
  end if;
  select exists(select 1 from public.portefeuille where vm_id=auth.uid()) into v_avec_portefeuille;
  insert into public.tournees(demandeur_id,zone,date_debut,date_fin,avec_portefeuille)
  values(auth.uid(),trim(p_zone),p_date_debut,p_date_fin,v_avec_portefeuille) returning id into v_id;
  insert into public.notifications(profile_id,type,titre,corps,metadata)
  select p.id,'TOURNEE_DEMANDE','Nouvelle demande de tournée',
    (select full_name from public.profiles where id=auth.uid()) || ' demande une tournée à ' || trim(p_zone) || ' du ' || to_char(p_date_debut,'DD/MM/YYYY') || ' au ' || to_char(p_date_fin,'DD/MM/YYYY') || '.',
    jsonb_build_object('tournee_id',v_id,'demandeur_id',auth.uid())
  from public.profiles p where p.role='admin' and p.actif;
  return v_id;
end; $$;
