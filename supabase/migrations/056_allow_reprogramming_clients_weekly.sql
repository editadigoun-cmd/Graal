-- Autoriser la reprogrammation d'un même client d'une semaine à l'autre, sans plafond mensuel.
-- Le contrôle de doublon au sein d'une même semaine est conservé.
CREATE OR REPLACE FUNCTION public.verifier_frequence_client_programme()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vm uuid;
  v_semaine date;
  v_date_visite date;
  v_debut_mois date;
  v_fin_mois date;
  v_count_week integer;
  v_count_month integer;
begin
  select p.vm_id, p.semaine_debut
    into v_vm, v_semaine
  from public.programmes_hebdomadaires p
  where p.id = new.programme_id;

  if v_vm is null then
    raise exception 'Impossible de contrôler la fréquence : VM/programme introuvable.';
  end if;

  if public.client_frequence_autorisee(v_vm, new.client_id, v_semaine) then
    return new;
  end if;

  v_date_visite := v_semaine;
  v_debut_mois := date_trunc('month', v_date_visite)::date;
  v_fin_mois := (date_trunc('month', v_date_visite) + interval '1 month - 1 day')::date;

  select count(*)
    into v_count_week
  from public.programme_lignes pl
  join public.programmes_hebdomadaires p on p.id = pl.programme_id
  where p.vm_id = v_vm
    and p.semaine_debut = v_semaine
    and pl.client_id = new.client_id
    and pl.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_count_week >= 1 then
    raise exception 'Client déjà programmé cette semaine. Un même client ne peut être programmé qu''une seule fois par semaine.';
  end if;
  -- La même clientèle peut être reprogrammée d'une semaine à l'autre sans plafond mensuel.
  -- Le contrôle des doublons à l'intérieur d'une même semaine reste actif.

return new;
end;
$function$
;
