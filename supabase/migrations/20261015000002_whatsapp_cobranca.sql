-- O que a Meta cobra da clínica (2026-10-15).
--
-- A conta do WhatsApp é da clínica e é ela quem paga a Meta (o BellarisOS é
-- Tech Provider). O sistema guarda, por mensagem, o que a Meta disse no status:
-- se cobrou e em qual categoria (`pricing`), e por que não entregou (`errors`).
-- Daí saem o "cobrado este mês" de cada número e o aviso de pagamento recusado
-- (131042), em Configurações → WhatsApp.

alter table public.messages
  add column if not exists cobranca_categoria text,
  add column if not exists cobranca_tipo text,
  add column if not exists cobrada boolean,
  add column if not exists erro_codigo integer,
  add column if not exists erro_texto text;

comment on column public.messages.cobranca_categoria is
  'pricing.category do status da Meta: marketing, utility, authentication, service…';
comment on column public.messages.cobrada is
  'pricing.billable do status da Meta — a fonte do "cobrado este mês", não uma regra nossa.';
comment on column public.messages.erro_codigo is
  'Código do erro do provedor (no envio ou no status failed). 131042 = conta da Meta sem forma de pagamento.';

create index if not exists messages_cobranca_idx
  on public.messages (tenant_id, created_at)
  where cobranca_categoria is not null;

create index if not exists messages_erro_idx
  on public.messages (tenant_id, created_at)
  where erro_codigo is not null;

-- O mês de cada número na Meta: entregues e cobradas por categoria. Conta só o
-- que chegou (delivered/read): a Meta cobra pela ENTREGA.
create or replace function public.metrics_whatsapp_cobranca(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (whatsapp_number_id uuid, categoria text, entregues bigint, cobradas bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.whatsapp_number_id,
         m.cobranca_categoria,
         count(*) filter (where m.status in ('delivered', 'read')),
         count(*) filter (where m.status in ('delivered', 'read') and m.cobrada)
    from public.messages m
   where m.tenant_id = p_tenant
     and m.direction = 'outbound'
     and m.cobranca_categoria is not null
     and m.whatsapp_number_id is not null
     and m.created_at >= p_from
     and m.created_at <  p_to
   group by m.whatsapp_number_id, m.cobranca_categoria
$$;

-- Números cuja conta na Meta recusou por falta de pagamento (131042) desde
-- p_desde, sem template ENTREGUE depois — entregou, o cartão foi resolvido.
create or replace function public.whatsapp_pagamento_recusado(p_tenant uuid, p_desde timestamptz)
returns table (whatsapp_number_id uuid, recusado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select f.whatsapp_number_id, max(f.created_at)
    from public.messages f
   where f.tenant_id = p_tenant
     and f.erro_codigo = 131042
     and f.whatsapp_number_id is not null
     and f.created_at >= p_desde
     and not exists (
       select 1 from public.messages o
        where o.tenant_id = p_tenant
          and o.whatsapp_number_id = f.whatsapp_number_id
          and o.template_id is not null
          and o.status in ('delivered', 'read')
          and o.created_at > f.created_at
     )
   group by f.whatsapp_number_id
$$;

revoke execute on function public.metrics_whatsapp_cobranca(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.whatsapp_pagamento_recusado(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_whatsapp_cobranca(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.whatsapp_pagamento_recusado(uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
