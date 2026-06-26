-- Configurações de integrações por tenant (WhatsApp, Instagram, Email, etc.)
create table public.integration_configs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  provider    text not null,
    -- whatsapp: 'zapi' | 'official'
    -- futuro: 'instagram' | 'resend'
  config      jsonb not null default '{}',
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, provider)
);

create index on public.integration_configs (tenant_id);
create index on public.integration_configs (provider, is_active);

alter table public.integration_configs enable row level security;

create policy "Network admin gerencia integrações" on public.integration_configs
  for all using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') = 'NETWORK_ADMIN'
  );
