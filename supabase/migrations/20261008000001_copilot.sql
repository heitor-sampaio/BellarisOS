-- O COPILOT (2026-10-08): a secretária virtual da clínica (docs/regras/copilot.md).
--
-- Quatro tabelas, todas com RLS ligada e ZERO políticas: a sessão não lê nem
-- grava nada daqui — só o servidor (service role), que confere rede, membro e
-- permissão antes. A conversa guarda o que a pessoa escreveu e o que as
-- ferramentas leram (nada clínico: o Copilot não tem ferramenta clínica).
--
-- - copilot_conversas: uma por assunto, de UMA pessoa (user_id).
-- - copilot_mensagens: a fala da pessoa, a do Copilot, as chamadas de
--   ferramenta (para o modelo lembrar o que leu) e as notas do sistema
--   ("a ação X foi confirmada").
-- - copilot_acoes: a GRAVAÇÃO preparada pelo Copilot, à espera do "Confirmar"
--   da pessoa. Confirmar reivindica a linha (pendente → executando numa escrita
--   só): o clique duplo não grava duas vezes.
-- - copilot_uso_mensal: os tokens por rede e mês — a cota do plano.

create table public.copilot_conversas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  titulo        text not null default 'Nova conversa',
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
create index idx_copilot_conversas_pessoa on public.copilot_conversas (user_id, atualizada_em desc);
create index idx_copilot_conversas_idade on public.copilot_conversas (atualizada_em);

create table public.copilot_mensagens (
  id             uuid primary key default gen_random_uuid(),
  conversa_id    uuid not null references public.copilot_conversas(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  papel          text not null check (papel in ('user', 'assistant', 'ferramenta', 'nota')),
  conteudo       jsonb not null default '{}'::jsonb,
  tokens_entrada integer not null default 0,
  tokens_saida   integer not null default 0,
  criada_em      timestamptz not null default now()
);
create index idx_copilot_mensagens_conversa on public.copilot_mensagens (conversa_id, criada_em);

create table public.copilot_acoes (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.copilot_conversas(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  ferramenta  text not null,
  payload     jsonb not null,
  resumo      jsonb not null,
  status      text not null default 'pendente'
              check (status in ('pendente', 'executando', 'feita', 'cancelada', 'falhou', 'vencida')),
  resultado   jsonb,
  expira_em   timestamptz not null default (now() + interval '15 minutes'),
  criada_em   timestamptz not null default now(),
  decidida_em timestamptz
);
create index idx_copilot_acoes_conversa on public.copilot_acoes (conversa_id, criada_em);

create table public.copilot_uso_mensal (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mes       date not null,
  tokens    bigint not null default 0,
  pedidos   integer not null default 0,
  primary key (tenant_id, mes)
);

alter table public.copilot_conversas  enable row level security;
alter table public.copilot_mensagens  enable row level security;
alter table public.copilot_acoes      enable row level security;
alter table public.copilot_uso_mensal enable row level security;

-- Soma o uso do mês (no fuso da clínica) numa escrita só: dois pedidos ao
-- mesmo tempo não se atropelam.
create or replace function public.copilot_registrar_uso(p_tenant uuid, p_tokens integer)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.copilot_uso_mensal as u (tenant_id, mes, tokens, pedidos)
  values (p_tenant, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, greatest(p_tokens, 0), 1)
  on conflict (tenant_id, mes) do update
    set tokens = u.tokens + greatest(excluded.tokens, 0), pedidos = u.pedidos + 1
  returning tokens;
$$;

revoke execute on function public.copilot_registrar_uso(uuid, integer) from public, anon, authenticated;
grant execute on function public.copilot_registrar_uso(uuid, integer) to service_role;

notify pgrst, 'reload schema';
