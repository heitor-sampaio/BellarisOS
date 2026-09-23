-- A corrente de fatos do sistema.
--
-- Existe para as automações terem em que se apoiar. Hoje há três tabelas de
-- histórico com propósitos próprios e incompatíveis — `lead_events` (linha do
-- tempo do card), `appointment_history` (auditoria do agendamento) e
-- `meta_capi_events` (fila da Meta) — e nada que responda "o que aconteceu no
-- sistema". O motor de automações vai assinar ESTA tabela e não precisar
-- conhecer nenhuma tabela de negócio.
--
-- Append-only. Nada aqui é atualizado nem apagado pelo app: um fato não deixa
-- de ter acontecido.
--
-- ⚠️ O catálogo de nomes mora em `packages/types/src/eventos.ts`, não num
-- `check` aqui. Um check obrigaria uma migração a cada evento novo, e o
-- TypeScript já barra nome inventado na emissão — que é onde o erro aconteceria.

create table if not exists public.domain_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  -- Unidade do FATO, quando ele tem uma. Null = é da rede.
  branch_id   uuid references public.branches(id) on delete set null,

  -- 'agendamento.nao_compareceu'. Nomeado pela INTENÇÃO, não pela operação:
  -- automação não consegue fazer nada com "appointments atualizado".
  nome        text not null,
  entidade    text not null,   -- 'agendamento'
  entidade_id uuid,

  -- Snapshot do que importa + `alterou: string[]` com os campos que mudaram.
  -- O snapshot poupa o motor de ir ao banco; `alterou` é o que torna possível
  -- "se o telefone mudou, revalidar o WhatsApp".
  dados       jsonb not null default '{}'::jsonb,

  -- Quem fez. Só a aplicação sabe: toda escrita passa pelo service role, então
  -- `auth.uid()` é nulo e gatilho no Postgres não teria como carimbar isto.
  ator_id     uuid,
  ator_nome   text,
  ator_tipo   text not null default 'sistema'
    check (ator_tipo in ('usuario', 'cliente', 'sistema')),

  -- De onde veio. 'webhook' e 'cron' não têm ator humano, e a automação pode
  -- querer tratar diferente o que o cliente fez sozinho.
  origem      text not null default 'app'
    check (origem in ('app', 'webhook', 'cron')),

  -- Idempotência opcional: quando preenchida, o mesmo fato não vira dois
  -- eventos ainda que o caminho rode duas vezes (reentrega de webhook,
  -- clique duplo, retentativa).
  chave       text,

  -- Momento do FATO. Pode ser anterior ao insert quando o evento é recuperado
  -- de um webhook atrasado.
  ocorrido_em timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

comment on table public.domain_events is
  'Corrente de fatos do sistema: toda ação relevante vira uma linha. Base dos '
  'gatilhos de automação. Append-only; o catálogo de nomes está em '
  'packages/types/src/eventos.ts.';

-- O motor assina por tipo de evento; a tela de um registro lê a linha do tempo
-- dele. São os dois acessos que existem.
create index if not exists domain_events_nome_idx
  on public.domain_events (tenant_id, nome, ocorrido_em desc);
create index if not exists domain_events_entidade_idx
  on public.domain_events (tenant_id, entidade, entidade_id, ocorrido_em desc);

-- Parcial: a maioria dos eventos não tem chave, e um índice único total
-- recusaria o segundo evento sem chave.
create unique index if not exists domain_events_chave_idx
  on public.domain_events (tenant_id, chave)
  where chave is not null;

alter table public.domain_events enable row level security;

-- Leitura pelo tenant. A escrita é só do service role: o emissor mora em
-- `lib/events/`, fora de `actions/`, porque todo export de um arquivo
-- 'use server' vira endpoint público — e um gravador exposto assim deixaria
-- qualquer cliente forjar a corrente.
drop policy if exists domain_events_select on public.domain_events;
create policy domain_events_select on public.domain_events
  for select using (tenant_id = public.jwt_claim('tenant_id')::uuid);

-- Realtime: é por aqui que o motor de automações vai escutar, pelo mesmo
-- caminho que `RealtimeRefresher` já usa nas telas.
alter publication supabase_realtime add table public.domain_events;
