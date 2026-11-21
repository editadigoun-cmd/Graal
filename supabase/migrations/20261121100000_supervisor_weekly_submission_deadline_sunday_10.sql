-- Enforce supervisor weekly planning submission deadline: Sunday 10:00 Benin time.
create or replace function public.verifier_deadline_soumission_planning_superviseur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline timestamptz;
begin
  if new.statut = 'SOUMIS'
     and old.statut in ('BROUILLON','REFUSE')
     and new.superviseur_id = auth.uid()
     and not public.is_admin() then
    v_deadline := ((new.semaine_debut - 1)::timestamp + time '10:00')
      at time zone 'Africa/Porto-Novo';
    if public.benin_now() > v_deadline then
      raise exception 'La date limite de soumission est dimanche à 10h00 (heure du Bénin).';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_deadline_soumission_planning_superviseur
  on public.programmes_visites_superviseurs;
create trigger trg_deadline_soumission_planning_superviseur
before update of statut on public.programmes_visites_superviseurs
for each row execute function public.verifier_deadline_soumission_planning_superviseur();
