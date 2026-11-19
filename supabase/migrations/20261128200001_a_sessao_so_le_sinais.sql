-- A sessão só lê SINAIS (o Heitor, 19/11, "vai na 2", à proposta "a sessão
-- não lê nem grava tabela nenhuma; só escuta os sinais do tempo real";
-- CLAUDE.md §4). Parte 1 de 2: o que se ACRESCENTA (vai antes do código).
--
-- A chave pública está no navegador: o que uma política de leitura deixa a
-- sessão ler, qualquer membro (ou cliente) lê direto no PostgREST, sem a trava
-- do servidor — a RLS recorta pela rede, mas não aplica o módulo, o "só os
-- meus" nem a abrangência. Em 19/11 eram 77 políticas de leitura em 76
-- tabelas (70 fora dos sinais). Toda leitura passa a ser do servidor, pelo
-- cliente de serviço, depois da trava; o navegador só assina sinais.
--
-- O que entra:
-- 1. A TRAVA: `e2e_leituras_pela_sessao()` lista todo caminho de leitura que
--    a sessão tem fora dos sinais. `e2e/rls-sessao-so-le-sinais.spec.ts` a
--    exige vazia — tabela nova que nascer com política de leitura derruba o
--    teste.
-- 2. `sinais`: uma linha por (rede, tópico, chave), sem conteúdo — "a agenda
--    desta rede mudou às X". A chave vazia é o sinal da EQUIPE da rede; a
--    chave preenchida é o login (auth.uid) de UMA pessoa: o aviso de um
--    membro, ou o que mudou para a cliente. Os sinais que já existiam
--    (`crm_quadro_sinais`, `prontuario_sinais`, `comissoes_sinais`,
--    `financeiro_sinais`, `automacoes_sinais`, `support_signals`) ficam.
-- 3. Os gatilhos que marcam `sinais` nas tabelas que as telas assinavam.
--
-- A parte 2 (20261128200002, DEPOIS do código no ar) tira as políticas de
-- leitura, as funções expostas e as tabelas que não são sinal do Realtime.

-- 1. A trava -------------------------------------------------------------------

create or replace function public.e2e_leituras_pela_sessao()
returns table (tipo text, objeto text, detalhe text)
language sql
stable
set search_path = ''
as $$
  -- Política PERMISSIVA de leitura para quem fala pela chave pública, fora
  -- das tabelas de sinal (as RESTRICTIVE só tiram).
  select 'politica', p.schemaname || '.' || p.tablename, p.policyname || ' (' || p.cmd || ')'
    from pg_catalog.pg_policies p
   where p.schemaname in ('public', 'storage', 'realtime')
     and p.permissive = 'PERMISSIVE'
     and p.cmd in ('SELECT', 'ALL')
     and p.roles && array['public', 'anon', 'authenticated']::name[]
     and not (p.schemaname = 'public' and (p.tablename = 'sinais' or p.tablename like '%\_sinais' or p.tablename = 'support_signals'))
  union all
  -- Tabela sem RLS em que a sessão tem permissão de leitura: lê tudo.
  select 'tabela_sem_rls', n.nspname || '.' || c.relname, null
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
     and (   pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
          or pg_catalog.has_table_privilege('anon', c.oid, 'SELECT'))
  union all
  -- View que a sessão lê (a view lê como o dono, sem a RLS de quem consulta).
  select 'view', n.nspname || '.' || c.relname, null
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
     and (   pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
          or pg_catalog.has_table_privilege('anon', c.oid, 'SELECT'))
  union all
  -- Função que a sessão executa pelo /rpc. Ficam duas, de propósito:
  -- `jwt_claim` (as políticas dos sinais a chamam como quem consulta) e
  -- `planos_do_site` (a tabela de preços pública do site, lida com a chave
  -- pública por quem ainda não tem conta — 20261017000001).
  select 'funcao', p.proname::text, pg_catalog.pg_get_function_identity_arguments(p.oid)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.prorettype <> 'trigger'::regtype
     and p.proname not in ('jwt_claim', 'planos_do_site')
     and (   pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'))
     and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  -- Tabela do Realtime que não é sinal: o navegador só assina sinais.
  select 'realtime', t.schemaname || '.' || t.tablename, null
    from pg_catalog.pg_publication_tables t
   where t.pubname = 'supabase_realtime'
     and not (t.schemaname = 'public' and (t.tablename = 'sinais' or t.tablename like '%\_sinais' or t.tablename = 'support_signals'))
  order by 1, 2, 3
$$;

revoke execute on function public.e2e_leituras_pela_sessao() from public, anon, authenticated;
grant execute on function public.e2e_leituras_pela_sessao() to service_role;

-- 2. Os sinais -----------------------------------------------------------------
--
-- Os tópicos (o que a tela assina → as tabelas que o marcam):
--   agenda        appointments
--   estoque       stock_movements, branch_product_stock, product_batches, products
--   procedimentos procedures, procedure_products
--   unidades      branches
--   equipe        users
--   clientes      clients
--   pacotes       client_packages, package_sessions
--   planos        treatment_plans, treatment_plan_sessions
--   inbox         conversations, leads — a LISTA do inbox
--   conversa      messages, conversations, leads — a chave é `c:<conversa>`:
--                 só a tela com aquela conversa aberta assina. A mensagem (e
--                 o recibo do WhatsApp: enviada, entregue, lida, o grosso do
--                 volume) marca só a conversa dela; a lista se move pela
--                 conversa (o gatilho da mensagem nova a atualiza) e pela
--                 oportunidade (19/11, ao Heitor: "o inbox que pode ter muita
--                 atualização e vai atualizar toda rede").
--   campanhas     notification_campaigns
--   avisos        user_notifications (o login do membro), client_notifications
--                 (o login da cliente) — o aviso é de UMA pessoa.
-- Fora a conversa e os avisos, uma linha por REDE (e tópico), não por
-- unidade: o tamanho real é a rede de uma unidade (CLAUDE.md §1), e o
-- servidor recarrega só o que a pessoa alcança.

create table if not exists public.sinais (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  topico    text not null,
  chave     text not null default '',
  mudou_em  timestamptz not null default now(),
  primary key (tenant_id, topico, chave)
);

comment on table public.sinais is
  'Sinal de "isto mudou nesta rede às X" — sem conteúdo, só para o realtime das telas, que recarregam pelo servidor. chave vazia = a equipe da rede; c:<id> = uma conversa (a equipe da rede); auth.uid = uma pessoa (os avisos dela).';

alter table public.sinais enable row level security;

-- Tabela do Realtime: a leitura é `to authenticated` (F26). A equipe lê o
-- sinal da rede dela (e o de cada conversa dela); cada pessoa (membro ou
-- cliente) lê os que são dela.
drop policy if exists sinais_select on public.sinais;
create policy sinais_select on public.sinais
  for select to authenticated
  using (
    ((chave = '' or chave like 'c:%') and (tenant_id)::text = jwt_claim('tenant_id') and jwt_claim('role') <> 'CLIENT')
    or chave = (select auth.uid())::text
  );

create policy suporte_sem_escrita_ins on public.sinais as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.sinais as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.sinais as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- 3. Os gatilhos ---------------------------------------------------------------
--
-- Um gatilho genérico: o tópico vem do argumento; a rede, da linha — pela
-- coluna tenant_id, ou pela unidade, o procedimento, o pacote ou o plano.
-- Nenhuma variável com nome de coluna: prefixo v_.

create or replace function private.marcar_sinal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha  jsonb;
  v_topico text := tg_argv[0];
  v_tenant uuid;
  v_chave  text := '';
begin
  if tg_op = 'DELETE' then v_linha := to_jsonb(old); else v_linha := to_jsonb(new); end if;

  if v_topico = 'avisos' then
    -- O aviso é de uma pessoa: a chave é o login dela.
    if tg_table_name = 'user_notifications' then
      select u.tenant_id, u.auth_id::text into v_tenant, v_chave
        from public.users u where u.id = (v_linha ->> 'user_id')::uuid;
    else
      select c.tenant_id, c.auth_id::text into v_tenant, v_chave
        from public.clients c where c.id = (v_linha ->> 'client_id')::uuid;
    end if;
    if v_chave is null then return null; end if;
  elsif v_topico = 'conversa' then
    -- A conversa: a chave é o id dela (na mensagem e na oportunidade, a
    -- conversa a que pertencem).
    v_tenant := (v_linha ->> 'tenant_id')::uuid;
    v_chave := 'c:' || case when tg_table_name = 'conversations' then v_linha ->> 'id' else v_linha ->> 'conversation_id' end;
    if v_chave is null then return null; end if;
  elsif v_linha ? 'tenant_id' then
    v_tenant := (v_linha ->> 'tenant_id')::uuid;
  elsif v_linha ? 'branch_id' then
    select b.tenant_id into v_tenant from public.branches b where b.id = (v_linha ->> 'branch_id')::uuid;
  elsif v_linha ? 'procedure_id' then
    select p.tenant_id into v_tenant from public.procedures p where p.id = (v_linha ->> 'procedure_id')::uuid;
  elsif v_linha ? 'client_package_id' then
    select b.tenant_id into v_tenant
      from public.client_packages cp join public.branches b on b.id = cp.branch_id
     where cp.id = (v_linha ->> 'client_package_id')::uuid;
  elsif v_linha ? 'plan_id' then
    select b.tenant_id into v_tenant
      from public.treatment_plans tp join public.branches b on b.id = tp.branch_id
     where tp.id = (v_linha ->> 'plan_id')::uuid;
  end if;

  if v_tenant is null then return null; end if;
  -- A rede apagada leva as linhas em cascata: o sinal dela não renasce (a
  -- chave estrangeira recusaria e derrubaria a exclusão da rede).
  if tg_op = 'DELETE' and not exists (select 1 from public.tenants t where t.id = v_tenant) then
    return null;
  end if;

  insert into public.sinais (tenant_id, topico, chave, mudou_em) values (v_tenant, v_topico, v_chave, now())
  on conflict (tenant_id, topico, chave) do update set mudou_em = excluded.mudou_em
  where public.sinais.mudou_em is distinct from excluded.mudou_em;
  return null;
end
$$;

revoke execute on function private.marcar_sinal() from public, anon, authenticated;

do $$
declare
  v_par text[];
begin
  foreach v_par slice 1 in array array[
    ['appointments', 'agenda'],
    ['stock_movements', 'estoque'],
    ['branch_product_stock', 'estoque'],
    ['product_batches', 'estoque'],
    ['products', 'estoque'],
    ['procedures', 'procedimentos'],
    ['procedure_products', 'procedimentos'],
    ['branches', 'unidades'],
    ['users', 'equipe'],
    ['clients', 'clientes'],
    ['client_packages', 'pacotes'],
    ['package_sessions', 'pacotes'],
    ['treatment_plans', 'planos'],
    ['treatment_plan_sessions', 'planos'],
    ['conversations', 'inbox'],
    ['leads', 'inbox'],
    ['messages', 'conversa'],
    ['conversations', 'conversa'],
    ['leads', 'conversa'],
    ['notification_campaigns', 'campanhas'],
    ['user_notifications', 'avisos'],
    ['client_notifications', 'avisos']
  ] loop
    -- O nome leva o tópico: a conversa e a oportunidade marcam dois.
    execute format('drop trigger if exists trg_sinal_%1$s on public.%1$I', v_par[1]);
    execute format('drop trigger if exists %3$I on public.%1$I', v_par[1], v_par[2], 'trg_sinal_' || v_par[1] || '_' || v_par[2]);
    execute format(
      'create trigger %3$I after insert or update or delete on public.%1$I
         for each row execute function private.marcar_sinal(%2$L)', v_par[1], v_par[2], 'trg_sinal_' || v_par[1] || '_' || v_par[2]);
  end loop;
end
$$;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sinais') then
    alter publication supabase_realtime add table public.sinais;
  end if;
end
$$;

notify pgrst, 'reload schema';
