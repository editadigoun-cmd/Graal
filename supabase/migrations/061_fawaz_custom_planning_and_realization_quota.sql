create or replace function public.is_fawaz_vm(p_vm_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (select 1 from public.profiles p where p.id=p_vm_id and lower(coalesce(p.email,''))='fawazakindele12@gmail.com');
$$;

do $migration$
declare v text;
begin
  select pg_get_functiondef('public.trg_programme_lignes_validate()'::regprocedure) into v;
  v := replace(v, 'max_gros_jour := case when new.jour = ''JEUDI'' then 5 else 3 end;',
    'max_gros_jour := case when public.is_fawaz_vm(prog.vm_id) then (case when new.jour = ''JEUDI'' then 10 else 7 end) when new.jour = ''JEUDI'' then 5 else 3 end;');
  v := replace(v, 'max_faible_jour := case when new.jour = ''JEUDI'' then 3 else 5 end;',
    'max_faible_jour := case when public.is_fawaz_vm(prog.vm_id) then 2147483647 when new.jour = ''JEUDI'' then 3 else 5 end;');
  v := replace(v, 'if new.jour = ''VENDREDI'' then',
    'if new.jour = ''VENDREDI'' and not public.is_fawaz_vm(prog.vm_id) then');
  execute v;

  select pg_get_functiondef('public.soumettre_programme_hebdomadaire(uuid)'::regprocedure) into v;
  v := replace(v, 'if nb_jeudi_gros > 5 or nb_jeudi_faible > 3 then',
    'if nb_jeudi_gros > (case when public.is_fawaz_vm(prog.vm_id) then 10 else 5 end) or (not public.is_fawaz_vm(prog.vm_id) and nb_jeudi_faible > 3) then');
  v := replace(v, 'Standards du jeudi dépassés : maximum 5 GROS et 3 FAIBLES; le nombre de MOYENS est libre.',
    'Standards du jeudi dépassés : FAWAZ maximum 10 GROS; autres VM maximum 5 GROS et 3 FAIBLES. MOYENS sans plafond fixe.');
  v := replace(v, 'if nb_vendredi_gros > 3 or nb_vendredi_faible > 5 then',
    'if nb_vendredi_gros > (case when public.is_fawaz_vm(prog.vm_id) then 7 else 3 end) or (not public.is_fawaz_vm(prog.vm_id) and nb_vendredi_faible > 5) then');
  v := replace(v, 'Standards du vendredi dépassés : maximum 3 GROS et 5 FAIBLES; le nombre de MOYENS est libre.',
    'Standards du vendredi dépassés : FAWAZ maximum 7 GROS; autres VM maximum 3 GROS et 5 FAIBLES. MOYENS sans plafond fixe.');
  v := replace(v, 'if nb_vendredi_faible > nb_vendredi_moyen then',
    'if not public.is_fawaz_vm(prog.vm_id) and nb_vendredi_faible > nb_vendredi_moyen then');
  execute v;
end
$migration$;

create or replace view public.v_taux_realisation_journalier as
select vm_id, date_visite as jour, count(*) as visites_prevues,
       count(*) filter (where statut_reel='REALISEE') as visites_realisees,
       round(case when public.is_fawaz_vm(vm_id)
         then least(count(*) filter (where statut_reel='REALISEE'),12)::numeric/12
         else count(*) filter (where statut_reel='REALISEE')::numeric/nullif(count(*),0)::numeric end,4) as taux_realisation,
       case when count(*)=0 then null::boolean else
         (case when public.is_fawaz_vm(vm_id)
           then least(count(*) filter (where statut_reel='REALISEE'),12)::numeric/12
           else count(*) filter (where statut_reel='REALISEE')::numeric/count(*)::numeric end)
         >= (public.parametre_numeric('seuil_conformite_journaliere_pourcentage',80)/100.0)
       end as conforme
from public.v_lignes_avec_statut
where programme_statut = any(array['VALIDE'::statut_programme,'VERROUILLE'::statut_programme])
group by vm_id,date_visite;
