-- O histórico do grafo de uma automação.
--
-- `automations.versao` existia desde a Fase 1 e só contava: cada salvamento
-- incrementava um número que não dava para consultar. O buraco aparece no dia
-- em que alguém mexe num fluxo que estava funcionando — e "estava funcionando"
-- é a informação que se perdia junto.
--
-- Cada salvamento grava um retrato aqui. Restaurar NÃO apaga nada: carrega o
-- grafo antigo no editor e, ao salvar, ele vira a versão seguinte. O histórico
-- é append-only, como o resto do que este sistema registra.

create table if not exists public.automation_versions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,

  -- O número que `automations.versao` tinha neste retrato.
  versao        int  not null,

  -- Nome, grafo e limites: o conjunto que define o comportamento. Restaurar
  -- sem os limites traria o desenho certo com a régua de silêncio de outro dia.
  nome          text  not null,
  grafo         jsonb not null,
  limites       jsonb not null default '{}'::jsonb,

  -- Quem salvou, pelo nome também: o usuário pode sair da rede depois, e
  -- "alguém" é pior resposta que o nome de quem era.
  criado_por      uuid references public.users(id) on delete set null,
  criado_por_nome text,

  created_at    timestamptz not null default now(),

  -- Uma linha por versão. Duas entregas simultâneas do mesmo salvamento não
  -- viram dois retratos do mesmo número.
  unique (automation_id, versao)
);

comment on table public.automation_versions is
  'Retrato do grafo a cada salvamento. Restaurar cria uma versão nova — nada é apagado.';

create index if not exists automation_versions_idx
  on public.automation_versions (automation_id, versao desc);

alter table public.automation_versions enable row level security;

-- Leitura pela rede, como as outras três tabelas do motor. A escrita é do
-- service role: quem grava é a action de salvar, nunca o navegador.
drop policy if exists automation_versions_leitura on public.automation_versions;
create policy automation_versions_leitura on public.automation_versions
  for select using (tenant_id = public.jwt_claim('tenant_id')::uuid);

notify pgrst, 'reload schema';
