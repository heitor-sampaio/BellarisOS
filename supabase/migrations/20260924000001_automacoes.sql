-- O motor de automações: o que reage à corrente de eventos.
--
-- Três tabelas, com papéis bem separados:
--   `automations`          a REGRA — o grafo que a clínica desenhou
--   `automation_runs`      uma EXECUÇÃO — e, ao mesmo tempo, a fila
--   `automation_run_steps` o passo a passo de uma execução
--
-- A fila mora no Postgres, e não num broker (Redis/BullMQ estão na tabela de
-- stack do CLAUDE.md e nunca foram usados). O projeto inteiro opera com
-- `after()` + cron, o volume de uma clínica é de dezenas de execuções por dia,
-- e uma tabela dá histórico e observabilidade de graça. Um broker aqui seria
-- infraestrutura nova para um problema que o banco resolve.

-- ─── A regra ──────────────────────────────────────────────────────────────
create table if not exists public.automations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,

  nome        text not null,
  descricao   text,

  status      text not null default 'RASCUNHO'
    check (status in ('RASCUNHO', 'ATIVA', 'PAUSADA')),

  -- Nodes e ligações, no formato que o quadro desenha. O catálogo de tipos de
  -- node mora em `packages/types/src/automacoes.ts`, não num `check` aqui —
  -- mesma razão do catálogo de eventos: um check obrigaria migração a cada
  -- node novo, e o TypeScript já barra tipo inventado na hora de montar.
  grafo       jsonb not null default '{"nos":[],"ligacoes":[]}'::jsonb,

  -- DESNORMALIZADO do grafo, e de propósito: é por aqui que o motor pergunta
  -- "quem assina `agendamento.nao_compareceu`?" sem abrir o grafo de ninguém.
  -- Reescrito a cada salvamento; ler o grafo de todas as automações da rede a
  -- cada evento é o que não escala.
  gatilhos    text[] not null default '{}',

  -- Limites de bom comportamento (silêncio noturno, teto por cliente). São
  -- regra de NEGÓCIO, não do código: cada rede tem a sua tolerância.
  limites     jsonb not null default '{}'::jsonb,

  versao      int  not null default 1,
  criado_por  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.automations is
  'Automações da rede: o grafo de nodes que reage aos eventos de domínio.';
comment on column public.automations.gatilhos is
  'Nomes de evento que o grafo assina. Derivado do grafo a cada salvamento — é o índice de busca do motor.';

create index if not exists automations_tenant_idx
  on public.automations (tenant_id, status);

-- GIN porque a pergunta do motor é de continência: `gatilhos @> ARRAY['x']`.
create index if not exists automations_gatilhos_idx
  on public.automations using gin (gatilhos);

-- ─── A execução, que também é a fila ──────────────────────────────────────
create table if not exists public.automation_runs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,

  -- Qual fato disparou. Nulo quando o gatilho é de tempo.
  evento_id     uuid references public.domain_events(id) on delete set null,

  status        text not null default 'esperando'
    check (status in ('esperando', 'rodando', 'ok', 'falhou', 'parado')),

  -- Retrato acumulado: o evento, o que foi hidratado e o que cada passo somou.
  contexto      jsonb not null default '{}'::jsonb,

  -- Onde parou. Nulo antes do primeiro passo e depois do último.
  no_atual      text,

  -- Quando voltar. É o que faz "esperar 3 dias" funcionar sem o processo
  -- segurar nada: a espera grava a data e devolve o run para a fila.
  rodar_apos    timestamptz not null default now(),

  tentativas    int not null default 0,
  erro          text,

  -- Anti-loop. Evento nascido de uma automação cria run com profundidade+1;
  -- o motor para no teto. Um anel fecha em três voltas, não em três mil.
  profundidade  int not null default 0,

  iniciado_em   timestamptz,
  fim_em        timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.automation_runs is
  'Uma execução de automação — e a própria fila: o cron recolhe por status + rodar_apos.';

-- O acesso do cron: o que está pronto para rodar, mais antigo primeiro.
create index if not exists automation_runs_fila_idx
  on public.automation_runs (status, rodar_apos)
  where status in ('esperando', 'falhou');

-- O acesso da tela: as execuções de uma automação, mais recente primeiro.
create index if not exists automation_runs_automacao_idx
  on public.automation_runs (automation_id, created_at desc);

-- Uma automação não roda duas vezes pelo MESMO evento. Parcial porque o
-- gatilho de tempo não tem evento, e um índice total recusaria o segundo run
-- agendado. (Índice parcial exige repetir o predicado no `on conflict` —
-- 42P10; a armadilha já documentada em `resolve-conversation.ts`.)
create unique index if not exists automation_runs_evento_idx
  on public.automation_runs (automation_id, evento_id)
  where evento_id is not null;

-- ─── O passo a passo ──────────────────────────────────────────────────────
-- Não é luxo: a pergunta que toda ferramenta dessas recebe é "por que não
-- disparou?", e sem o passo a passo a resposta é palpite. Mesmo raciocínio do
-- painel de eventos.
create table if not exists public.automation_run_steps (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.automation_runs(id) on delete cascade,
  ordem      int  not null,
  no_id      text not null,
  tipo       text not null,
  status     text not null check (status in ('ok', 'falhou', 'pulado', 'esperando')),
  -- O que o passo decidiu, em linguagem de gente: qual saída do IF, para quem
  -- foi a mensagem, por que parou.
  resumo     jsonb not null default '{}'::jsonb,
  ms         int,
  created_at timestamptz not null default now()
);

create index if not exists automation_run_steps_run_idx
  on public.automation_run_steps (run_id, ordem);

-- ─── Origem nova na corrente de eventos ───────────────────────────────────
-- Ação de automação emite evento como qualquer outra escrita. Sem uma origem
-- própria, o motor não teria como distinguir o que ELE fez do que uma pessoa
-- fez — e é essa distinção que segura o anel.
alter table public.domain_events drop constraint if exists domain_events_origem_check;
alter table public.domain_events add constraint domain_events_origem_check
  check (origem in ('app', 'webhook', 'cron', 'banco', 'automacao'));

-- ─── RLS ──────────────────────────────────────────────────────────────────
-- Leitura pelo tenant; escrita só pelo service role. O motor e o editor
-- passam por `lib/` e por actions que autorizam — nada aqui é escrito pelo
-- cliente direto.
alter table public.automations          enable row level security;
alter table public.automation_runs      enable row level security;
alter table public.automation_run_steps enable row level security;

drop policy if exists automations_leitura on public.automations;
create policy automations_leitura on public.automations
  for select using (tenant_id = public.jwt_claim('tenant_id')::uuid);

drop policy if exists automation_runs_leitura on public.automation_runs;
create policy automation_runs_leitura on public.automation_runs
  for select using (tenant_id = public.jwt_claim('tenant_id')::uuid);

drop policy if exists automation_run_steps_leitura on public.automation_run_steps;
create policy automation_run_steps_leitura on public.automation_run_steps
  for select using (
    exists (
      select 1 from public.automation_runs r
      where r.id = run_id
        and r.tenant_id = public.jwt_claim('tenant_id')::uuid
    )
  );

-- A tela de execuções acompanha em tempo real, como o inbox já faz.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'automation_runs'
  ) then
    alter publication supabase_realtime add table public.automation_runs;
  end if;
end $$;
