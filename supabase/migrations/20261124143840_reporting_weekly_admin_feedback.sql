alter table public.reporting_hebdomadaire
  add column if not exists appreciation_admin text,
  add column if not exists recommandations_admin text,
  add column if not exists visa_admin_id uuid references public.profiles(id),
  add column if not exists visa_admin_at timestamptz;
