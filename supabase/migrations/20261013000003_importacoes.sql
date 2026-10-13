-- O importador de contatos (CSV), 2026-10-13.
--
-- `importacoes`: um pedido por linha — o destino (clientes ou contatos do CRM),
-- o mapeamento das colunas, a oportunidade opcional, o andamento (para
-- Configurações → Ações em lote e para a própria tela) e o relatório de erros.
--
-- `importacao_linhas`: as linhas do arquivo SÓ enquanto a importação roda —
-- saem a cada pedaço gravado. Se o servidor reinicia no meio, o que sobrou é o
-- que falta (e "Tentar de novo" continua dali: gravar de novo é seguro, o
-- repetido só completa o vazio).
--
-- O relatório de erros guarda o valor errado (é dado pessoal): expira em 7
-- dias (`erros_expiram_em`).
--
-- As duas: RLS ligada e ZERO políticas permissivas — só o servidor.

create table if not exists public.importacoes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  branch_id        uuid references public.branches(id) on delete set null,
  criada_por       uuid references public.users(id) on delete set null,
  destino          text not null check (destino in ('clientes', 'contatos')),
  nome_arquivo     text not null,
  mapeamento       jsonb not null,
  oportunidade     jsonb,
  status           text not null default 'pendente'
                   check (status in ('pendente', 'importando', 'concluida', 'falhou')),
  total            integer not null default 0,
  processadas      integer not null default 0,
  novas            integer not null default 0,
  completadas      integer not null default 0,
  sem_mudanca      integer not null default 0,
  com_erro         integer not null default 0,
  oportunidades    integer not null default 0,
  erros            jsonb not null default '[]'::jsonb,
  erro             text,
  criada_em        timestamptz not null default now(),
  iniciada_em      timestamptz,
  concluida_em     timestamptz,
  atualizada_em    timestamptz not null default now(),
  erros_expiram_em timestamptz
);

create index if not exists idx_importacoes_rede on public.importacoes (tenant_id, criada_em desc);

create table if not exists public.importacao_linhas (
  importacao_id uuid not null references public.importacoes(id) on delete cascade,
  numero        integer not null,
  valores       jsonb not null,
  primary key (importacao_id, numero)
);

alter table public.importacoes enable row level security;
alter table public.importacao_linhas enable row level security;

-- A sessão de suporte não grava pelo PostgREST (o laço de 20261008000010).
do $$
declare t text;
begin
  foreach t in array array['importacoes', 'importacao_linhas'] loop
    execute format($p$create policy suporte_sem_escrita_ins on public.%I as restrictive for insert
      with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                       else not private.suporte_sem_escrita() end)$p$, t);
    execute format($p$create policy suporte_sem_escrita_upd on public.%I as restrictive for update
      using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                  else not private.suporte_sem_escrita() end)
      with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                       else not private.suporte_sem_escrita() end)$p$, t);
    execute format($p$create policy suporte_sem_escrita_del on public.%I as restrictive for delete
      using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                  else not private.suporte_sem_escrita() end)$p$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
