alter table public.vad_duo_quotas_mensuels
  drop constraint if exists vad_duo_quotas_mensuels_refus_motif_check;
alter table public.vad_duo_quotas_mensuels
  add constraint vad_duo_quotas_mensuels_refus_motif_check
  check (statut <> 'REFUSE' or nullif(btrim(commentaire_admin), '') is not null);
