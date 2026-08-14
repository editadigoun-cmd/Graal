-- Le catalogue produits devient propre à chaque équipe (au lieu d'être partagé par toutes).
-- Les produits existants étaient jusqu'ici visibles par toutes les équipes : pour ne rien
-- retirer à personne, on les affecte à la première équipe créée puis on les duplique pour
-- chaque autre équipe, avant de rendre equipe_id obligatoire.
alter table public.produits add column if not exists equipe_id uuid references public.equipes(id);

do $$
declare
  premiere_equipe uuid;
begin
  select id into premiere_equipe from public.equipes order by created_at asc limit 1;
  if premiere_equipe is not null then
    update public.produits set equipe_id = premiere_equipe where equipe_id is null;
  end if;
end $$;

-- L'ancienne contrainte unique(nom) doit être retirée AVANT la duplication ci-dessous, sinon
-- "on conflict do nothing" absorbe silencieusement chaque insertion dupliquée (nom déjà pris).
alter table public.produits drop constraint if exists produits_nom_key;
alter table public.produits alter column equipe_id set not null;
alter table public.produits add constraint produits_nom_equipe_key unique (equipe_id, nom);
create index if not exists produits_equipe_idx on public.produits(equipe_id);

do $$
declare
  premiere_equipe uuid;
  p record;
  e record;
begin
  select id into premiere_equipe from public.equipes order by created_at asc limit 1;
  if premiere_equipe is null then
    return;
  end if;

  for p in select id, nom, actif from public.produits where equipe_id = premiere_equipe loop
    for e in select id from public.equipes where id <> premiere_equipe loop
      insert into public.produits (nom, actif, equipe_id)
      values (p.nom, p.actif, e.id)
      on conflict (equipe_id, nom) do nothing;
    end loop;
  end loop;
end $$;
