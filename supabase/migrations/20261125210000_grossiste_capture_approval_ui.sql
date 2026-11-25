-- Track approval separately from product-matching status.
create table if not exists public.grossiste_capture_validations (
  grossiste_id uuid not null references public.grossistes(id) on delete cascade,
  date_capture date not null,
  approved_by uuid,
  approved_at timestamptz not null default now(),
  primary key (grossiste_id,date_capture)
);
alter table public.grossiste_capture_validations enable row level security;
drop policy if exists "Admins can read grossiste capture validations" on public.grossiste_capture_validations;
create policy "Admins can read grossiste capture validations"
on public.grossiste_capture_validations for select to authenticated using (public.is_admin());

insert into public.grossiste_capture_validations(grossiste_id,date_capture,approved_by,approved_at)
select grossiste_id,(started_at at time zone 'Africa/Porto-Novo')::date,null,finished_at
from public.grossiste_sync_runs
where finished_at is not null and status in ('success','needs_human')
on conflict (grossiste_id,date_capture) do nothing;

create or replace function public.approve_grossiste_capture(p_grossiste_id uuid,p_date_capture date)
returns jsonb language plpgsql security definer set search_path=public
as $function$
declare v_rows integer:=0; v_qty numeric:=0; v_inserted integer:=0;
begin
 if not public.is_admin() then raise exception 'Accès administrateur requis pour valider cette capture'; end if;
 if not exists(select 1 from public.grossiste_ventes_snapshots where grossiste_id=p_grossiste_id and date_capture=p_date_capture) then
   raise exception 'Aucune capture trouvée pour ce grossiste et cette date';
 end if;
 insert into public.grossiste_capture_validations(grossiste_id,date_capture,approved_by,approved_at)
 values(p_grossiste_id,p_date_capture,auth.uid(),now())
 on conflict(grossiste_id,date_capture) do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=0 then return jsonb_build_object('already_validated',true,'capture_date',p_date_capture,'published_rows',0,'published_quantity',0); end if;
 with inserted as (
   insert into public.grossiste_ventes_integrations(grossiste_id,code_externe,produit_id,mois_reference,date_capture,date_vente,quantite)
   select d.grossiste_id,d.code_externe,d.produit_id,d.mois_reference,d.date_capture,d.date_vente,d.ventes_jour_precedent
   from public.grossiste_ventes_journalieres d
   where d.grossiste_id=p_grossiste_id and d.date_capture=p_date_capture
     and d.status='calculated' and d.produit_id is not null and coalesce(d.ventes_jour_precedent,0)>0
   on conflict(grossiste_id,code_externe,mois_reference,date_capture) do nothing
   returning produit_id,grossiste_id,date_vente,quantite
 ), totals as (
   select produit_id,grossiste_id,date_trunc('week',date_vente)::date semaine_debut,sum(quantite) quantite
   from inserted group by produit_id,grossiste_id,date_trunc('week',date_vente)::date
 ), weekly as (
   insert into public.ventes_hebdomadaires(produit_id,grossiste_id,semaine_debut,quantite,created_by)
   select produit_id,grossiste_id,semaine_debut,quantite,auth.uid() from totals
   on conflict(produit_id,grossiste_id,semaine_debut)
   do update set quantite=public.ventes_hebdomadaires.quantite+excluded.quantite,updated_at=now()
   returning 1
 )
 select count(*),coalesce(sum(quantite),0) into v_rows,v_qty from inserted;
 return jsonb_build_object('already_validated',false,'capture_date',p_date_capture,'published_rows',v_rows,'published_quantity',v_qty);
end;
$function$;
grant execute on function public.approve_grossiste_capture(uuid,date) to authenticated;

create or replace view public.grossiste_ventes_mensuelles as
with latest_approved as (
 select distinct on(s.grossiste_id,s.code_externe,s.mois_reference)
   s.grossiste_id,s.code_externe,m.produit_id,s.mois_reference report_month,
   s.cumul_mois::numeric(14,3) quantite_cumulee,s.created_at
 from public.grossiste_ventes_snapshots s
 join public.mappings_produits_grossistes m on m.grossiste_id=s.grossiste_id and m.code_externe=s.code_externe
 where s.cumul_mois is not null and (
   exists(select 1 from public.grossiste_capture_validations v where v.grossiste_id=s.grossiste_id and v.date_capture=s.date_capture)
   or exists(select 1 from public.grossiste_sync_runs r where r.grossiste_id=s.grossiste_id
     and (r.started_at at time zone 'Africa/Porto-Novo')::date=s.date_capture
     and r.finished_at is not null and r.status in ('success','needs_human'))
 )
 order by s.grossiste_id,s.code_externe,s.mois_reference,s.date_capture desc,s.created_at desc,s.id desc
)
select grossiste_id,code_externe,produit_id,report_month,quantite_cumulee,created_at from latest_approved;
