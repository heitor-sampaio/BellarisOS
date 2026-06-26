-- Atribuição de mídia paga nos leads: click IDs e UTM parameters
alter table public.leads
  add column if not exists fbclid       text,   -- Facebook/Instagram click ID
  add column if not exists gclid        text,   -- Google click ID
  add column if not exists utm_source   text,   -- ex: facebook, google
  add column if not exists utm_medium   text,   -- ex: cpc, paid
  add column if not exists utm_campaign text;   -- nome da campanha

-- Índice para consultas de atribuição por período
create index if not exists leads_attribution_idx
  on public.leads (tenant_id, utm_source, created_at desc)
  where utm_source is not null;
