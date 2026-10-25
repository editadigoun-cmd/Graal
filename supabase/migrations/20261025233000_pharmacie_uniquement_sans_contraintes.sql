-- En mode pharmacie uniquement, ne pas bloquer une pharmacie parce qu'elle a été visitée la semaine précédente.
-- Le contrôle du portefeuille et de l'état actif du client reste assuré par trg_programme_lignes_validate.
create or replace function public.client_deja_vu_semaine_precedente(p_vm_id uuid, p_client_id uuid, p_semaine_cible date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when exists (
      select 1 from public.programmes_hebdomadaires p
      where p.vm_id = p_vm_id
        and p.semaine_debut = p_semaine_cible
        and p.mode_pharmacie_uniquement = true
    ) then false
    else exists (
      select 1 from public.visites v
      where v.vm_id = p_vm_id
        and v.client_id = p_client_id
        and v.jour >= p_semaine_cible - 7
        and v.jour < p_semaine_cible
        and v.statut in ('REALISEE','HORS_PROGRAMME')
    )
  end;
$function$;
