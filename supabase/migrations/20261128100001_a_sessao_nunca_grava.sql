-- A sessão NUNCA grava (o Heitor, 19/11: "Qualquer gravação que não passa
-- pela validação do backend ta errada e é uma brecha de segurança";
-- CLAUDE.md §4).
--
-- A chave pública está no navegador: o que uma política deixa a sessão
-- gravar, qualquer membro (ou cliente) grava direto no PostgREST, sem a trava
-- da action (permissão, alcance, "só os meus"). Em 19/11 sobravam 21 políticas
-- de escrita em 17 tabelas — vindas, a maioria, das primeiras migrations
-- (julho), de antes de a gravação passar toda pelo servidor. Conferido em
-- 19/11: nenhuma gravação do app nessas tabelas usa o cliente da sessão
-- (todas são do cliente de serviço, depois da trava), então tirá-las não
-- muda tela nenhuma.
--
-- O que muda:
-- 1. As políticas de INSERT/UPDATE/DELETE saem.
-- 2. As de ALL saem; a LEITURA que elas davam volta como SELECT, com a MESMA
--    condição (`to authenticated`, a regra do Realtime — F26). As de ALL que
--    já não davam nada (comparavam `auth.jwt() ->> 'tenant_id'`, que mora em
--    `app_metadata` — CLAUDE.md §4) saem sem reposição: a leitura continua
--    como estava, nenhuma.
--    `conversations` e `messages` já têm a leitura da rede
--    (`*_select_tenant`), mais larga que a da ALL: nada a repor.
-- 3. A TRAVA: `e2e_gravacoes_pela_sessao()` lista todo caminho de escrita
--    que a sessão ainda tem — política permissiva de escrita, tabela sem RLS
--    com permissão de escrita, view gravável, função volátil que a sessão
--    executa. `e2e/rls-sessao-nunca-grava.spec.ts` exige a lista vazia: a
--    tabela nova que nascer com política de escrita derruba o teste.

-- 3. A trava ------------------------------------------------------------------

create or replace function public.e2e_gravacoes_pela_sessao()
returns table (tipo text, objeto text, detalhe text)
language sql
stable
set search_path = ''
as $$
  -- Política PERMISSIVA de escrita para quem fala pela chave pública (as
  -- RESTRICTIVE, como as do suporte, só tiram: não abrem nada).
  select 'politica', p.schemaname || '.' || p.tablename, p.policyname || ' (' || p.cmd || ')'
    from pg_catalog.pg_policies p
   where p.schemaname in ('public', 'storage')
     and p.permissive = 'PERMISSIVE'
     and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and p.roles && array['public', 'anon', 'authenticated']::name[]
  union all
  -- Tabela sem RLS em que a sessão tem permissão de escrita: grava tudo.
  select 'tabela_sem_rls', n.nspname || '.' || c.relname, null
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
     and (   pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT')
          or pg_catalog.has_table_privilege('authenticated', c.oid, 'UPDATE')
          or pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE')
          or pg_catalog.has_table_privilege('anon', c.oid, 'INSERT')
          or pg_catalog.has_table_privilege('anon', c.oid, 'UPDATE')
          or pg_catalog.has_table_privilege('anon', c.oid, 'DELETE'))
  union all
  -- View em que a sessão grava (a view simples é gravável, e grava como o dono).
  select 'view_gravavel', n.nspname || '.' || c.relname, null
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and (   pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT')
          or pg_catalog.has_table_privilege('authenticated', c.oid, 'UPDATE')
          or pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE')
          or pg_catalog.has_table_privilege('anon', c.oid, 'INSERT')
          or pg_catalog.has_table_privilege('anon', c.oid, 'UPDATE')
          or pg_catalog.has_table_privilege('anon', c.oid, 'DELETE'))
  union all
  -- Função VOLÁTIL (a que pode gravar) que a sessão executa pelo /rpc.
  select 'funcao', p.proname::text, pg_catalog.pg_get_function_identity_arguments(p.oid)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.provolatile = 'v'
     and p.prorettype <> 'trigger'::regtype
     and (   pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'))
     and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
  order by 1, 2, 3
$$;

revoke execute on function public.e2e_gravacoes_pela_sessao() from public, anon, authenticated;
grant execute on function public.e2e_gravacoes_pela_sessao() to service_role;

-- 1. As políticas de escrita ----------------------------------------------------

drop policy if exists appointments_insert on public.appointments;
drop policy if exists appointments_update on public.appointments;
drop policy if exists appointments_delete on public.appointments;

drop policy if exists "Cliente atualiza próprias notificações" on public.client_notifications;
drop policy if exists user_notifications_update on public.user_notifications;

drop policy if exists lead_events_rede_insert on public.lead_events;

drop policy if exists push_tokens_insert on public.push_tokens;
drop policy if exists push_tokens_update on public.push_tokens;
drop policy if exists push_tokens_delete on public.push_tokens;

-- 2. As de ALL ----------------------------------------------------------------

-- Leitura viva: volta como SELECT, com a mesma condição.
drop policy if exists cash_registers_operacional on public.cash_registers;
drop policy if exists cash_registers_select on public.cash_registers;
create policy cash_registers_select on public.cash_registers
  for select to authenticated
  using ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));

drop policy if exists crm_funnels_tenant on public.crm_funnels;
drop policy if exists crm_funnels_select on public.crm_funnels;
create policy crm_funnels_select on public.crm_funnels
  for select to authenticated
  using ((tenant_id)::text = jwt_claim('tenant_id'));

drop policy if exists message_templates_tenant on public.message_templates;
drop policy if exists message_templates_select on public.message_templates;
create policy message_templates_select on public.message_templates
  for select to authenticated
  using ((tenant_id)::text = jwt_claim('tenant_id'));

drop policy if exists stock_transfers_operacional on public.stock_transfers;
drop policy if exists stock_transfers_select on public.stock_transfers;
create policy stock_transfers_select on public.stock_transfers
  for select to authenticated
  using ((jwt_claim('role') <> 'CLIENT') and (private.can_access_branch(from_branch_id) or private.can_access_branch(to_branch_id)));

drop policy if exists "Cliente gerencia próprio token push" on public.web_push_subscriptions;
drop policy if exists web_push_subscriptions_select on public.web_push_subscriptions;
create policy web_push_subscriptions_select on public.web_push_subscriptions
  for select to authenticated
  using (client_id in (select private.clientes_do_login()));

-- Já coberta pela leitura da rede (`conversations_select_tenant`, `messages_select_tenant`).
drop policy if exists conversations_operacional on public.conversations;
drop policy if exists messages_operacional on public.messages;

-- Mortas (`auth.jwt() ->> 'tenant_id'` é sempre nulo): não davam leitura nem escrita.
drop policy if exists "Operacional acessa historico de agendamentos do proprio tenant" on public.appointment_history;
drop policy if exists "Operacional acessa estoque da propria filial" on public.branch_product_stock;
drop policy if exists "Operacional acessa etapas do proprio tenant" on public.crm_stages;
drop policy if exists "Operacional acessa lead_procedures do proprio tenant" on public.lead_procedures;
drop policy if exists "Operacional acessa itens via plano da propria filial" on public.treatment_plan_items;

notify pgrst, 'reload schema';
