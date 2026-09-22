-- Eventos enviados à API de Conversões da Meta.
--
-- ⚠️ Esta tabela NÃO é a fila de entrega. O envio acontece na hora em que o
-- fato acontece (agendou, pagou), porque a Meta penaliza evento que chega
-- tarde: mais de uma hora depois já atrapalha a otimização de entrega, que é
-- justamente o que se quer do `Schedule`.
--
-- A linha existe por três motivos, em ordem de importância:
--
--  1. `event_id` precisa EXISTIR ANTES do envio. A Meta deduplica por ele; sem
--     um id estável guardado, qualquer reenvio — automático ou manual — conta a
--     mesma venda duas vezes.
--  2. Quando o número da Meta divergir do nosso (e vai), esta é a única forma
--     de saber de que lado se perdeu. A tela de Marketing lê `conversions` da
--     própria Meta: um Purchase perdido vira CPA errado sem rastro.
--  3. Rede de segurança: o que ficou `pendente` ou `falhou` é recolhido depois
--     pelo cron, como exceção e não como caminho normal.

create table if not exists public.meta_capi_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,

  -- O id que vai para a Meta no campo `event_id`. Determinístico a partir do
  -- fato (ex.: 'schedule:<appointment_id>'), para que o MESMO fato gere sempre
  -- o mesmo id mesmo que o código rode duas vezes.
  event_id     text not null,
  event_name   text not null,

  -- De onde veio o clique. Sem `ctwa_clid` não há atribuição de
  -- click-to-WhatsApp — o evento é aceito e some, que é pior que não mandar.
  ctwa_clid    text,
  ad_id        text,

  -- Valor em reais, quando o evento carrega dinheiro (Purchase).
  valor        numeric(12,2),

  -- O que foi de fato enviado, para conferência quando os números divergirem.
  payload      jsonb,

  status       text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'falhou', 'descartado')),
  tentativas   int  not null default 0,
  erro         text,
  -- Momento do FATO, não do envio: é o `event_time` que a Meta recebe.
  ocorrido_em  timestamptz not null default now(),
  enviado_em   timestamptz,
  created_at   timestamptz not null default now(),

  -- A trava de dedup de verdade: o mesmo fato não vira duas linhas.
  unique (tenant_id, event_id)
);

comment on table public.meta_capi_events is
  'Registro dos eventos mandados à API de Conversões da Meta. O envio é imediato; '
  'esta tabela guarda o event_id (dedup), o payload (auditoria) e o que falhou '
  '(retentativa pelo cron).';

-- O cron procura só o que ficou para trás.
create index if not exists meta_capi_events_pendentes_idx
  on public.meta_capi_events (tenant_id, ocorrido_em)
  where status in ('pendente', 'falhou');

alter table public.meta_capi_events enable row level security;

-- Leitura pelo tenant (para uma tela de conferência, quando houver);
-- a escrita é só do service role.
drop policy if exists meta_capi_events_select on public.meta_capi_events;
create policy meta_capi_events_select on public.meta_capi_events
  for select using (tenant_id = public.jwt_claim('tenant_id')::uuid);


-- ─── ctwa_clid a um salto de distância ────────────────────────────────────
--
-- O click id mora em `messages.ad_referral` e em `conversations.attribution`.
-- Para um agendamento, achá-lo seria
-- `appointment -> client -> conversation -> attribution`. Carimbado no lead e
-- no cliente, vira um salto só — e sobrevive a alguém mudar a conversa de
-- lugar ou arquivá-la.
alter table public.leads
  add column if not exists ctwa_clid text;

alter table public.clients
  add column if not exists ctwa_clid text;

comment on column public.leads.ctwa_clid is
  'Click id do anúncio click-to-WhatsApp que trouxe este lead. Carimbado na '
  'criação a partir da conversa, para a API de Conversões não precisar '
  'percorrer conversa e mensagens a cada evento.';

comment on column public.clients.ctwa_clid is
  'Idem leads: herdado quando o contato vira cliente, para o Purchase saber a '
  'qual clique atribuir.';
