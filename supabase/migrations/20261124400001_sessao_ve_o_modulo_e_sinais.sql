-- A sessão lê só o que o CARGO deixa ver, e as telas das Automações e a do
-- atendimento escutam um SINAL (varredura de conformidade de 18/11: ATD-P01,
-- AUT-01).
--
-- ADITIVA: só cria. Aplicar ANTES do deploy do código que assina
-- `automacoes_sinais` e `prontuario_sinais` (canal do Realtime com tabela fora
-- da publicação falha inteiro). As políticas novas e a saída de
-- `domain_events`, `automation_runs` e `medical_record_entries` do Realtime
-- estão na 20261124400002, DEPOIS do deploy.
--
-- 1. private.sessao_ve_o_modulo: o "can(ctx, módulo, 'VIEW')" do buildContext
--    (lib/auth.ts) no banco, para a política de LEITURA de dado que só um
--    módulo NÃO escopável abre (as automações; o prontuário é escopável —
--    "só os meus" — e não se lê pela sessão: CLAUDE.md §4 e §11). Membro ATIVO da rede do token; a
--    Admin da rede pelo cargo de SISTEMA gravado (tenant_roles.key =
--    'NETWORK_ADMIN' com is_system — nunca a claim `role`, C58/F70); os
--    outros pela matriz do cargo (role_permissions em Ver ou Gerenciar). O
--    PLANO corta por cima, inclusive da Admin (rede_tem_recurso; sem retrato,
--    tudo liberado). Com p_so_rede_inteira, só quem tem "A rede inteira"
--    (users.branch_id nulo) — as Automações moram no portal da rede.
--    Lê a rede pela claim (jwt_claim: rede bloqueada e suporte encerrado dão
--    nulo → falso). Use na política como `(select private.sessao_ve_o_modulo(…))`
--    para o Postgres avaliar uma vez por consulta, não por linha.

create or replace function private.sessao_ve_o_modulo(
  p_modulo text,
  p_recurso text default null,
  p_so_rede_inteira boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_uid    text := coalesce(auth.uid()::text, '');
  v_tenant text := public.jwt_claim('tenant_id');
  v_ok     boolean;
begin
  if v_uid = '' or v_tenant is null or public.jwt_claim('role') = 'CLIENT' then
    return false;
  end if;
  if p_recurso is not null and not private.rede_tem_recurso(v_tenant::uuid, p_recurso) then
    return false;
  end if;
  select ((tr.key = 'NETWORK_ADMIN' and tr.is_system)
          or exists (select 1 from public.role_permissions rp
                      where rp.role_id = u.role_id
                        and rp.module = p_modulo
                        and rp.level::text in ('VIEW', 'MANAGE')))
         and (not p_so_rede_inteira or u.branch_id is null)
    into v_ok
    from public.users u
    left join public.tenant_roles tr on tr.id = u.role_id and tr.tenant_id = u.tenant_id
   where u.auth_id = v_uid
     and u.is_active
     and u.tenant_id::text = v_tenant
   limit 1;
  return coalesce(v_ok, false);
end
$$;

-- A política roda como quem consulta: a sessão (authenticated) executa. Não
-- recebe rede por parâmetro (lê a do token), então não é porta aberta.
revoke execute on function private.sessao_ve_o_modulo(text, text, boolean) from public, anon;
grant execute on function private.sessao_ve_o_modulo(text, text, boolean) to authenticated, service_role;

-- 2. O sinal das Automações: "as automações desta rede mudaram às X", sem
--    conteúdo. /admin/automacoes assinava `automation_runs` e
--    /admin/automacoes/eventos assinava `domain_events` — e o websocket
--    entregava a linha inteira (inclusive o texto da mensagem recebida,
--    `conversa.mensagem_recebida`) a todo membro da rede. Mesmo padrão de
--    comissoes_sinais (20261112006301) e crm_quadro_sinais.

create table if not exists public.automacoes_sinais (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  mudou_em  timestamptz not null default now()
);

comment on table public.automacoes_sinais is
  'Sinal de "as automações (execuções e fatos) desta rede mudaram" — sem conteúdo, só para o realtime das telas das Automações.';

alter table public.automacoes_sinais enable row level security;

-- Tabela do Realtime: a leitura é `to authenticated` (F26).
create policy automacoes_sinais_select on public.automacoes_sinais
  for select to authenticated
  using ((tenant_id)::text = jwt_claim('tenant_id') and jwt_claim('role') <> 'CLIENT');

-- Ninguém grava pela sessão (sem política de escrita); as restritivas do
-- suporte valem para toda tabela nova (20261008000010).
create policy suporte_sem_escrita_ins on public.automacoes_sinais as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.automacoes_sinais as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.automacoes_sinais as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- Nenhuma variável com nome de coluna: prefixo v_.
create or replace function public.on_automacoes_mudaram()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if tg_op = 'DELETE' then v_tenant := old.tenant_id; else v_tenant := new.tenant_id; end if;
  if v_tenant is null then return null; end if;
  -- A rede apagada leva as automações em cascata: o sinal dela não renasce
  -- (a chave estrangeira recusaria e derrubaria a exclusão da rede).
  if tg_op = 'DELETE' and not exists (select 1 from public.tenants t where t.id = v_tenant) then
    return null;
  end if;
  insert into public.automacoes_sinais (tenant_id, mudou_em) values (v_tenant, now())
  on conflict (tenant_id) do update set mudou_em = excluded.mudou_em
  where automacoes_sinais.mudou_em is distinct from excluded.mudou_em;
  return null;
end
$$;

revoke execute on function public.on_automacoes_mudaram() from public, anon, authenticated;

-- A execução que nasce, anda ou some (a contagem da lista).
drop trigger if exists trg_sinal_automacoes_execucoes on public.automation_runs;
create trigger trg_sinal_automacoes_execucoes
  after insert or update or delete on public.automation_runs
  for each row execute function public.on_automacoes_mudaram();

-- O fato que chega (a corrente de "O que já aconteceu"). Só o INSERT: o
-- despacho (`despachado_em`) não muda o que a tela mostra.
drop trigger if exists trg_sinal_automacoes_fatos on public.domain_events;
create trigger trg_sinal_automacoes_fatos
  after insert on public.domain_events
  for each row execute function public.on_automacoes_mudaram();

-- A automação criada, editada, ligada ou pausada (por outra pessoa, noutra aba).
drop trigger if exists trg_sinal_automacoes_cadastro on public.automations;
create trigger trg_sinal_automacoes_cadastro
  after insert or update or delete on public.automations
  for each row execute function public.on_automacoes_mudaram();

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'automacoes_sinais') then
    alter publication supabase_realtime add table public.automacoes_sinais;
  end if;
end
$$;

-- 3. O sinal do prontuário: "o prontuário de alguém desta rede mudou às X".
--    A tela do atendimento assinava `medical_record_entries`, e o websocket
--    entregava a evolução inteira a quem o Prontuário "só os meus" (módulo
--    escopável, SCOPED_MODULES) esconde. Uma linha por REDE, sem conteúdo:
--    nem o atendimento nem a cliente aparecem (uma linha por agendamento
--    diria quem está sendo atendida). A tela recarrega pelo servidor, que
--    aplica o Prontuário e o escopo dele.

create table if not exists public.prontuario_sinais (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  mudou_em  timestamptz not null default now()
);

comment on table public.prontuario_sinais is
  'Sinal de "o prontuário de alguém desta rede mudou" — sem conteúdo, só para o realtime da tela do atendimento.';

alter table public.prontuario_sinais enable row level security;

create policy prontuario_sinais_select on public.prontuario_sinais
  for select to authenticated
  using ((tenant_id)::text = jwt_claim('tenant_id') and jwt_claim('role') <> 'CLIENT');

create policy suporte_sem_escrita_ins on public.prontuario_sinais as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.prontuario_sinais as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.prontuario_sinais as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- `medical_record_entries` não tem tenant_id: a rede vem pelo prontuário e
-- pela ficha. Nenhuma variável com nome de coluna: prefixo v_.
create or replace function public.on_prontuario_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registro uuid;
  v_tenant   uuid;
begin
  if tg_op = 'DELETE' then v_registro := old.medical_record_id; else v_registro := new.medical_record_id; end if;
  select c.tenant_id into v_tenant
    from public.medical_records m
    join public.clients c on c.id = m.client_id
   where m.id = v_registro;
  -- Rede (ou ficha) apagada em cascata: o sinal dela não renasce.
  if v_tenant is null or not exists (select 1 from public.tenants t where t.id = v_tenant) then
    return null;
  end if;
  insert into public.prontuario_sinais (tenant_id, mudou_em) values (v_tenant, now())
  on conflict (tenant_id) do update set mudou_em = excluded.mudou_em
  where prontuario_sinais.mudou_em is distinct from excluded.mudou_em;
  return null;
end
$$;

revoke execute on function public.on_prontuario_mudou() from public, anon, authenticated;

drop trigger if exists trg_sinal_prontuario_registros on public.medical_record_entries;
create trigger trg_sinal_prontuario_registros
  after insert or update or delete on public.medical_record_entries
  for each row execute function public.on_prontuario_mudou();

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prontuario_sinais') then
    alter publication supabase_realtime add table public.prontuario_sinais;
  end if;
end
$$;

notify pgrst, 'reload schema';
