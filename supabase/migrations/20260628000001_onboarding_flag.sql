alter table public.tenants
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists website                 text;
