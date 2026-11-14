-- CF3b — o registro da auditoria (docs/revisao.md, bloco Configurações; o
-- Heitor, 2026-11-13: "queria um lugar para auditoria, acho que como dos
-- eventos, onde o admin pudesse ver tudo o que aconteceu").
--
-- `public.auditoria`: uma linha por registro que uma gravação mudou (criou,
-- editou, apagou), mais a abertura do prontuário (`abriu`) e a entrada no
-- sistema (`entrou`). Quem agiu sai da própria requisição:
--   - pela SESSÃO (role authenticated): o dono do token (`sub`) — cabeçalho
--     nenhum vale;
--   - pelo SERVIDOR (service_role): o cabeçalho `x-bellaris-ator` (o login da
--     requisição, que o `createAdminClient` manda em toda escrita) e o
--     `x-bellaris-suporte-sessao` (a sessão de suporte, a mesma marca do
--     `domain_events`). Só a chave de serviço chega a esses cabeçalhos;
--   - sem ninguém (cron, webhook, script, SQL): "O sistema".
-- O nome é o do `ctx`: o membro, e no suporte "Fulana (via suporte: Atendente)"
-- — a mesma conta de `nomeComSuporte`.
--
-- O que NÃO entra: o texto. Do registro clínico e da credencial vão só os
-- NOMES das colunas mudadas; dos outros, os nomes e uma lista curta de valores
-- sem dado pessoal (situação, datas, valores, o nome de uma sala ou de uma
-- tag). O nome da cliente e do membro se lê na hora de mostrar (a
-- anonimização da LGPD vale para a auditoria também).
--
-- Não se altera nem se apaga — nem pelo servidor. Sai com a rede (a cascata
-- da chave para `tenants`) e com a limpeza da rede de TESTE
-- (`bellaris.apagando_rede`, o mesmo do prontuário — 20261115100001).
--
-- A sessão não lê (nenhuma política permissiva, e sem privilégio): a tela lê
-- pelo servidor, depois da permissão "Auditoria" e com as unidades do membro.
--
-- Falha do registro NÃO derruba a gravação principal: o gatilho segura o erro,
-- grava uma linha `incompleto` (quando dá) e deixa um WARNING no log. Recusar
-- a venda porque o registro dela falhou trancaria a rede por um defeito
-- secundário (como o `registrarAcessoAoProntuario`); calar de todo esconderia
-- o buraco — a linha incompleta o deixa à vista.
--
-- Nenhuma linha antiga entra (sem backfill): a auditoria começa hoje.

-- ─── A tabela ────────────────────────────────────────────────────────────────
create table if not exists public.auditoria (
  id                bigint generated always as identity primary key,
  criado_em         timestamptz not null default now(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  branch_id         uuid,
  client_id         uuid,
  tabela            text not null,
  operacao          text not null check (operacao in ('criou', 'editou', 'apagou', 'abriu', 'entrou')),
  registro_id       text,
  colunas           text[] not null default '{}',
  antes             jsonb not null default '{}'::jsonb,
  depois            jsonb not null default '{}'::jsonb,
  ator_user_id      uuid,
  ator_cliente_id   uuid,
  ator_nome         text not null,
  ator_tipo         text not null check (ator_tipo in ('membro', 'suporte', 'cliente', 'plataforma', 'sistema')),
  suporte_sessao_id uuid,
  incompleto        boolean not null default false,
  erro              text
);

comment on table public.auditoria is
  'CF3b: o que mudou, quem mudou e quando. Só o servidor escreve (gatilhos e auditoria_registrar_entrada); não se altera nem se apaga; a sessão não lê.';

create index if not exists auditoria_rede_idx     on public.auditoria (tenant_id, id desc);
create index if not exists auditoria_unidade_idx  on public.auditoria (tenant_id, branch_id, id desc);
create index if not exists auditoria_cliente_idx  on public.auditoria (tenant_id, client_id, id desc) where client_id is not null;
create index if not exists auditoria_pessoa_idx   on public.auditoria (tenant_id, ator_user_id, id desc) where ator_user_id is not null;
create index if not exists auditoria_quando_idx   on public.auditoria (tenant_id, criado_em desc);

-- A sessão não lê nem grava; o servidor lê. O UPDATE e o DELETE ficam com o
-- servidor só para o gatilho de baixo dizer, com todas as letras, que não pode.
alter table public.auditoria enable row level security;
revoke all on public.auditoria from public, anon, authenticated, service_role;
grant select, update, delete on public.auditoria to service_role;

do $$
begin
  execute $p$create policy suporte_sem_escrita_ins on public.auditoria as restrictive for insert
    with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                     else not private.suporte_sem_escrita() end)$p$;
  execute $p$create policy suporte_sem_escrita_upd on public.auditoria as restrictive for update
    using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                else not private.suporte_sem_escrita() end)
    with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                     else not private.suporte_sem_escrita() end)$p$;
  execute $p$create policy suporte_sem_escrita_del on public.auditoria as restrictive for delete
    using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                else not private.suporte_sem_escrita() end)$p$;
exception when duplicate_object then null;
end $$;

-- ─── Não se altera nem se apaga ──────────────────────────────────────────────
create or replace function private.auditoria_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and (
       pg_trigger_depth() > 1                                                    -- a rede saiu (cascata)
       or current_setting('bellaris.apagando_rede', true) = old.tenant_id::text  -- a limpeza da rede de teste
     ) then
    return old;
  end if;
  raise exception 'A auditoria não se altera nem se apaga.' using errcode = '42501';
end $$;

create or replace function private.auditoria_sem_truncate()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'A auditoria não se altera nem se apaga.' using errcode = '42501';
end $$;

drop trigger if exists auditoria_imutavel on public.auditoria;
create trigger auditoria_imutavel before update or delete on public.auditoria
  for each row execute function private.auditoria_imutavel();
drop trigger if exists auditoria_sem_truncate on public.auditoria;
create trigger auditoria_sem_truncate before truncate on public.auditoria
  for each statement execute function private.auditoria_sem_truncate();

-- ─── O recorte dos valores que entram ───────────────────────────────────────
create or replace function private.auditoria_recorte(p_linha jsonb, p_chaves text[], p_com_nulos boolean)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, p_linha -> k), '{}'::jsonb)
    from unnest(coalesce(p_chaves, '{}'::text[])) as k
   where p_linha ? k and (p_com_nulos or jsonb_typeof(p_linha -> k) <> 'null')
$$;

-- ─── O gatilho (por COMANDO, com as tabelas de transição) ───────────────────
-- Argumentos: modo (normal | clinico | segredo), a coluna que dá nome ao
-- registro, as colunas cujo VALOR entra, o pai ("tabela:coluna", para quem
-- não tem rede nem unidade), e a chave (padrão: id).
create or replace function private.auditar()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_modo        text   := coalesce(nullif(tg_argv[0], ''), 'normal');
  v_rotulo      text[] := coalesce(string_to_array(nullif(tg_argv[1], ''), ','), '{}'::text[]);
  v_valores     text[] := coalesce(string_to_array(nullif(tg_argv[2], ''), ','), '{}'::text[]);
  v_pai         text   := nullif(tg_argv[3], '');
  v_chave       text[] := coalesce(string_to_array(nullif(tg_argv[4], ''), ','), array['id']);
  v_tab         text   := tg_table_name;
  v_op          text;
  v_linhas      jsonb;
  v_pais        jsonb  := '{}'::jsonb;
  v_pai_tab     text;
  v_pai_col     text;
  v_ids         uuid[];
  v_claims      jsonb;
  v_cab         jsonb;
  v_auth        text;
  v_sessao_tx   text;
  v_membro      uuid;
  v_membro_nome text;
  v_membro_rede uuid;
  v_staff_nome  text;
  v_sessao      uuid;
  v_sessao_rede uuid;
  v_atendente   text;
  v_ignorar     constant text[] := array['updated_at', 'atualizado_em', 'atualizada_em', 'updated_by'];
begin
  -- A limpeza da rede de teste não deixa rastro (ela apaga a auditoria junto).
  if coalesce(current_setting('bellaris.apagando_rede', true), '') <> '' then
    return null;
  end if;

  v_op := case tg_op
            when 'INSERT' then case when v_tab = 'prontuario_acessos' then 'abriu' else 'criou' end
            when 'UPDATE' then 'editou'
            else 'apagou' end;

  begin
    -- As linhas, como jsonb (a de antes e a de depois, pareadas pela chave).
    if tg_op = 'INSERT' then
      select coalesce(jsonb_agg(jsonb_build_object('n', to_jsonb(n))), '[]'::jsonb) into v_linhas from novas n;
    elsif tg_op = 'DELETE' then
      select coalesce(jsonb_agg(jsonb_build_object('o', to_jsonb(o))), '[]'::jsonb) into v_linhas from velhas o;
    else
      with nn as (
        select x.j, (select string_agg(x.j ->> k, '|' order by u.ord) from unnest(v_chave) with ordinality as u(k, ord)) as ch
          from (select to_jsonb(n) as j from novas n) x
      ), oo as (
        select x.j, (select string_agg(x.j ->> k, '|' order by u.ord) from unnest(v_chave) with ordinality as u(k, ord)) as ch
          from (select to_jsonb(o) as j from velhas o) x
      )
      select coalesce(jsonb_agg(jsonb_build_object('n', nn.j, 'o', oo.j)), '[]'::jsonb) into v_linhas
        from nn join oo on oo.ch = nn.ch;
    end if;

    if jsonb_array_length(v_linhas) = 0 then
      return null;
    end if;

    -- O pai: de onde vêm a rede, a unidade e a cliente de quem não as tem.
    if v_pai is not null then
      v_pai_tab := split_part(v_pai, ':', 1);
      v_pai_col := split_part(v_pai, ':', 2);
      select array_agg(distinct (coalesce(e -> 'n', e -> 'o') ->> v_pai_col)::uuid) into v_ids
        from jsonb_array_elements(v_linhas) e
       where coalesce(e -> 'n', e -> 'o') ->> v_pai_col is not null;
      if v_ids is not null then
        execute format(
          $q$select coalesce(jsonb_object_agg(p.id::text, jsonb_build_object(
                'tenant_id', to_jsonb(p) ->> 'tenant_id', 'branch_id', to_jsonb(p) ->> 'branch_id',
                'client_id', to_jsonb(p) ->> 'client_id')), '{}'::jsonb)
               from public.%I p where p.id = any($1)$q$, v_pai_tab)
          into v_pais using v_ids;
      end if;
    end if;

    -- Quem agiu: a sessão é o dono do token; o servidor diz pelo cabeçalho.
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    if v_claims ->> 'role' = 'authenticated' then
      v_auth := nullif(btrim(v_claims ->> 'sub'), '');
    elsif v_claims ->> 'role' = 'service_role' then
      v_cab := nullif(current_setting('request.headers', true), '')::jsonb;
      v_auth := nullif(btrim(v_cab ->> 'x-bellaris-ator'), '');
      v_sessao_tx := v_cab ->> 'x-bellaris-suporte-sessao';
    end if;
    if v_auth is not null then
      select u.id, u.name, u.tenant_id into v_membro, v_membro_nome, v_membro_rede
        from public.users u where u.auth_id = v_auth;
      if v_membro is null and v_auth ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select coalesce(nullif(btrim(ps.name), ''), 'Equipe do BellarisOS') into v_staff_nome
          from public.platform_staff ps where ps.auth_id = v_auth::uuid;
      end if;
    end if;
    if v_sessao_tx ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select s.id, s.tenant_id, coalesce(nullif(btrim(ps.name), ''), 'BellarisOS')
        into v_sessao, v_sessao_rede, v_atendente
        from public.support_sessions s
        left join public.platform_staff ps on ps.id = s.staff_id
       where s.id = v_sessao_tx::uuid;
    end if;

    insert into public.auditoria (
      tenant_id, branch_id, client_id, tabela, operacao, registro_id, colunas, antes, depois,
      ator_user_id, ator_cliente_id, ator_nome, ator_tipo, suporte_sessao_id)
    select tn.id, z.b, z.c, v_tab, v_op, z.reg, z.cols,
           case when v_modo <> 'normal' then '{}'::jsonb
                when tg_op = 'DELETE' then private.auditoria_recorte(z.o, v_rotulo || v_valores, false)
                when tg_op = 'UPDATE' then private.auditoria_recorte(z.o,
                  array(select k from unnest(v_rotulo || v_valores) k where k = any(z.cols)), true)
                else '{}'::jsonb end,
           case when v_modo <> 'normal' then '{}'::jsonb
                when tg_op = 'INSERT' then private.auditoria_recorte(z.n, v_rotulo || v_valores, false)
                when tg_op = 'UPDATE' then private.auditoria_recorte(z.n, v_rotulo, false)
                  || private.auditoria_recorte(z.n, array(select k from unnest(v_valores) k where k = any(z.cols)), true)
                else '{}'::jsonb end,
           a.user_id, a.cliente_id, a.nome, a.tipo, a.sessao
      from (
        select y.n, y.o, y.r,
               nullif(case v_tab when 'tenants' then y.r ->> 'id' else coalesce(y.r ->> 'tenant_id', v_pais -> (y.r ->> v_pai_col) ->> 'tenant_id') end, '')::uuid as t,
               nullif(case v_tab when 'branches' then y.r ->> 'id' else coalesce(y.r ->> 'branch_id', v_pais -> (y.r ->> v_pai_col) ->> 'branch_id') end, '')::uuid as b,
               nullif(case v_tab when 'clients' then y.r ->> 'id' else coalesce(y.r ->> 'client_id', v_pais -> (y.r ->> v_pai_col) ->> 'client_id') end, '')::uuid as c,
               y.r ->> 'id' as reg,
               case when tg_op = 'UPDATE' then
                 array(select k from jsonb_object_keys(y.n) k
                        where (y.n -> k) is distinct from (y.o -> k) and k <> all(v_ignorar) order by k)
               else '{}'::text[] end as cols
          from (select e -> 'n' as n, e -> 'o' as o, coalesce(e -> 'n', e -> 'o') as r
                  from jsonb_array_elements(v_linhas) e) y
      ) z
      left join public.branches br on br.id = z.b and z.t is null
      left join public.clients cl on cl.id = z.c and z.t is null and z.b is null
      join public.tenants tn on tn.id = coalesce(z.t, br.tenant_id, cl.tenant_id)
      left join public.clients ca on v_membro is null and v_staff_nome is null and v_auth is not null
                                  and ca.tenant_id = tn.id and ca.auth_id = v_auth
      cross join lateral (
        select
          case when v_tab = 'prontuario_acessos' then nullif(z.r ->> 'user_id', '')::uuid
               when v_membro is not null and v_membro_rede = tn.id then v_membro end as user_id,
          case when v_tab <> 'prontuario_acessos' and ca.id is not null then ca.id end as cliente_id,
          case
            when v_tab = 'prontuario_acessos' then coalesce(nullif(btrim(z.r ->> 'ator_nome'), ''), 'Alguém da equipe')
            when v_sessao is not null and v_sessao_rede = tn.id then
              coalesce(nullif(btrim(case when v_membro_rede = tn.id then v_membro_nome end), ''), 'Membro')
              || ' (via suporte: ' || v_atendente || ')'
            when v_membro is not null and v_membro_rede = tn.id then coalesce(nullif(btrim(v_membro_nome), ''), 'Membro')
            when v_staff_nome is not null then v_staff_nome || ' (BellarisOS)'
            when ca.id is not null then 'A cliente, pelo portal'
            else 'O sistema' end as nome,
          case
            when v_sessao is not null and v_sessao_rede = tn.id then 'suporte'
            when v_tab = 'prontuario_acessos' then 'membro'
            when v_membro is not null and v_membro_rede = tn.id then 'membro'
            when v_staff_nome is not null then 'plataforma'
            when ca.id is not null then 'cliente'
            else 'sistema' end as tipo,
          case when v_sessao is not null and v_sessao_rede = tn.id then v_sessao end as sessao
      ) a
     where tg_op <> 'UPDATE' or cardinality(z.cols) > 0;

  exception when others then
    -- O registro falhou: a gravação principal segue, e o buraco fica à vista.
    begin
      insert into public.auditoria (tenant_id, tabela, operacao, ator_nome, ator_tipo, incompleto, erro)
      select distinct tn.id, v_tab, v_op, 'Não identificado', 'sistema', true, left(sqlerrm, 300)
        from jsonb_array_elements(coalesce(v_linhas, '[]'::jsonb)) e
        cross join lateral (select coalesce(e -> 'n', e -> 'o') as r) y
        left join public.branches br on br.id = nullif(y.r ->> 'branch_id', '')::uuid
        join public.tenants tn on tn.id = coalesce(nullif(y.r ->> 'tenant_id', '')::uuid, br.tenant_id);
    exception when others then
      null;
    end;
    raise warning 'auditoria: o registro de % em % falhou: %', v_op, v_tab, sqlerrm;
  end;
  return null;
end $fn$;

-- ─── As tabelas ──────────────────────────────────────────────────────────────
-- Ficam de fora (de propósito): o que o próprio sistema deriva ou só registra
-- o andamento (domain_events, automation_runs/steps/versions, *_sinais,
-- envios_unicos, campaign_dispatches, notificações e tokens de push, meta_*,
-- copilot_*, importacao_linhas, *_attempts, support_access_log,
-- support_entry_codes, asaas_events, platform_*, subscription_invoices,
-- whatsapp_historicos, messages, conversations, branch_product_stock,
-- procedure_price_history, appointment_history, lead_events,
-- issued_document_events, loyalty_accounts, commission_lines,
-- recebiveis_do_cartao, quick_replies (de cada pessoa), prontuario_versoes, as
-- fotos e a anamnese (anamnesis_data, record_photos), stock_transfers e
-- stock_transfer_items (sem rede nem unidade própria — o movimento de estoque
-- que geram entra), stock_movement_batches, avaliacoes_dos_procedimentos.
do $$
declare
  v record;
begin
  for v in
    select * from (values
      -- tabela, modo, rótulo, valores, pai, chave
      ('agenda_bloqueios',              'normal',  '',      'motivo,starts_at,ends_at,inicio,fim', '', ''),
      ('appointments',                  'normal',  '',      'status,scheduled_at,procedure_id,professional_id,room_id,price,duration_minutes', '', ''),
      ('automations',                   'normal',  'nome',  'status', '', ''),
      ('branches',                      'normal',  'name',  'is_active', '', ''),
      ('cash_registers',                'normal',  '',      'opened_at,closed_at,opening_balance,closing_balance', '', ''),
      ('client_documents',              'clinico', '',      '', '', ''),
      ('client_packages',               'normal',  '',      'status,price,package_id', '', ''),
      ('clients',                       'normal',  '',      'is_active', '', ''),
      ('comanda_itens',                 'normal',  '',      'quantidade,valor,preco', '', ''),
      ('comandas',                      'normal',  '',      'status', '', ''),
      ('commission_configs',            'normal',  '',      'modo,periodo,produto_pct,produto_modo,plano_pct,desconta_insumos,desconta_taxa,base_com_pontos', '', 'tenant_id'),
      ('commission_payouts',            'normal',  '',      'amount,valor,status', '', ''),
      ('commission_rules',              'normal',  '',      'type,is_active,value,valor,percentage', '', ''),
      ('commissions',                   'normal',  '',      'amount,type,status', '', ''),
      ('consent_terms',                 'clinico', '',      '', 'medical_records:medical_record_id', ''),
      ('contacts',                      'normal',  '',      '', '', ''),
      ('creditos_vendidos',             'normal',  '',      'valor,status', '', ''),
      ('crm_funnels',                   'normal',  'name',  '', '', ''),
      ('crm_motivos_perda',             'normal',  'nome',  'ativo', '', ''),
      ('crm_origens',                   'normal',  'nome',  'ativo', '', ''),
      ('crm_stages',                    'normal',  'name',  '', '', ''),
      ('document_sign_links',           'segredo', '',      '', '', ''),
      ('document_signatures',           'segredo', '',      '', '', ''),
      ('document_templates',            'normal',  'name',  'is_active', '', ''),
      ('fechamentos_do_dia',            'normal',  '',      'dia,diferenca', '', ''),
      ('financial_transactions',        'normal',  '',      'type,status,amount,payment_method,due_date,paid_at,category', '', ''),
      ('forms',                         'normal',  'name',  'is_active,tipo', '', ''),
      ('fornecedores',                  'normal',  'nome',  '', '', ''),
      ('fundos_de_troco',               'normal',  '',      'valor', '', ''),
      ('importacoes',                   'normal',  '',      'status,tipo', '', ''),
      ('indicacao_premios',             'normal',  '',      'tipo,status', '', ''),
      ('injectable_applications',       'clinico', '',      '', '', ''),
      ('injectable_maps',               'clinico', '',      '', '', ''),
      ('installments',                  'normal',  '',      'amount,due_date,is_paid,paid_at', 'financial_transactions:transaction_id', ''),
      ('integration_configs',           'segredo', '',      '', '', ''),
      ('internal_credits',              'normal',  '',      'amount', '', ''),
      ('issued_documents',              'normal',  'title', 'status', '', ''),
      ('leads',                         'normal',  '',      'status,stage_id,funnel_id', '', ''),
      ('lgpd_requests',                 'normal',  '',      'type,status', '', ''),
      ('loyalty_configs',               'normal',  '',      'enabled,points_per_real,redeem_points_value,earn_mode,expiry_months', '', ''),
      ('loyalty_rewards',               'normal',  'name',  'is_active,type', '', ''),
      ('loyalty_transactions',          'normal',  '',      'type,points', '', ''),
      ('loyalty_vouchers',              'normal',  'name',  'status', '', ''),
      ('maquininhas',                   'normal',  'nome',  '', '', ''),
      ('marcas',                        'normal',  'nome',  '', '', ''),
      ('medical_record_entries',        'clinico', '',      '', 'medical_records:medical_record_id', ''),
      ('medical_records',               'clinico', '',      '', '', ''),
      ('message_templates',             'normal',  'name',  'status,category', '', ''),
      ('notification_campaigns',        'normal',  'name',  'status,type,scheduled_at', '', ''),
      ('package_sessions',              'normal',  '',      'status', 'client_packages:client_package_id', ''),
      ('payment_fees',                  'normal',  '',      'metodo,parcelas,taxa_pct,taxa_pct_sem_teto', '', 'tenant_id,metodo,parcelas'),
      ('pre_atendimento_links',         'segredo', '',      '', '', ''),
      ('pre_atendimentos',              'clinico', '',      '', '', ''),
      ('procedure_branch_availability', 'normal',  '',      '', '', ''),
      ('procedure_branch_pricing',      'normal',  '',      'price,labor_cost', '', ''),
      ('procedure_categories',          'normal',  'nome',  '', '', ''),
      ('procedure_products',            'normal',  '',      'quantity', 'procedures:procedure_id', ''),
      ('procedure_professionals',       'normal',  '',      '', '', ''),
      ('procedure_rooms',               'normal',  '',      '', '', ''),
      ('procedure_sale_units',          'normal',  '',      'status', 'procedure_sales:sale_id', ''),
      ('procedure_sales',               'normal',  '',      'quantity,price,status', '', ''),
      ('procedures',                    'normal',  'name',  'price,is_active,category', '', ''),
      ('product_batches',               'normal',  '',      'quantity', '', ''),
      ('product_categories',            'normal',  'name',  '', '', ''),
      ('product_sale_items',            'normal',  '',      'quantity', '', ''),
      ('product_sale_returns',          'normal',  '',      'quantidade,valor', '', ''),
      ('product_sales',                 'normal',  '',      'quantity,price,status', '', ''),
      ('products',                      'normal',  'name',  'is_active,category', '', ''),
      ('prontuario_acessos',            'normal',  '',      'ponto', '', ''),
      ('prontuario_anotacoes',          'clinico', '',      '', '', ''),
      ('role_permissions',              'normal',  '',      'module,level,scope', '', ''),
      ('role_report_tabs',              'normal',  '',      'tab,aba', '', ''),
      ('rooms',                         'normal',  'name',  'is_active', '', ''),
      ('service_package_items',         'normal',  '',      'quantity', '', ''),
      ('service_packages',              'normal',  'name',  'price,is_active', '', ''),
      ('stock_movements',               'normal',  '',      'type,quantity,product_id', '', ''),
      ('support_grants',                'normal',  '',      'via,includes_clinical,expires_at,revoked_at', '', ''),
      ('support_sessions',              'normal',  '',      'status,includes_clinical,started_at,ended_at,end_reason', '', ''),
      ('tags',                          'normal',  'nome',  'arquivada_em', '', ''),
      ('tenant_roles',                  'normal',  'label', 'key,inbox_caixas', '', ''),
      ('tenants',                       'normal',  'name',  'is_active', '', ''),
      ('treatment_plan_items',          'normal',  '',      '', 'treatment_plans:plan_id', ''),
      ('treatment_plan_sessions',       'normal',  '',      '', 'treatment_plans:plan_id', ''),
      ('treatment_plans',               'normal',  'name',  'status', '', ''),
      ('users',                         'normal',  '',      'is_active,role_id,branch_id', '', ''),
      ('whatsapp_number_users',         'normal',  '',      '', '', ''),
      ('whatsapp_numbers',              'segredo', '',      '', '', '')
    ) as x(tabela, modo, rotulo, valores, pai, chave)
  loop
    execute format('drop trigger if exists auditoria_ins on public.%I', v.tabela);
    execute format('drop trigger if exists auditoria_upd on public.%I', v.tabela);
    execute format('drop trigger if exists auditoria_del on public.%I', v.tabela);
    execute format(
      'create trigger auditoria_ins after insert on public.%I referencing new table as novas '
      'for each statement execute function private.auditar(%L, %L, %L, %L, %L)',
      v.tabela, v.modo, v.rotulo, v.valores, v.pai, v.chave);
    -- O acesso ao prontuário só nasce (e não se altera).
    if v.tabela <> 'prontuario_acessos' then
      execute format(
        'create trigger auditoria_upd after update on public.%I referencing old table as velhas new table as novas '
        'for each statement execute function private.auditar(%L, %L, %L, %L, %L)',
        v.tabela, v.modo, v.rotulo, v.valores, v.pai, v.chave);
      execute format(
        'create trigger auditoria_del after delete on public.%I referencing old table as velhas '
        'for each statement execute function private.auditar(%L, %L, %L, %L, %L)',
        v.tabela, v.modo, v.rotulo, v.valores, v.pai, v.chave);
    end if;
  end loop;
end $$;

-- ─── A entrada no sistema ────────────────────────────────────────────────────
-- Chamada pelo servidor no login (loginAction e /api/auth/session), com o login
-- que acabou de entrar. Só membro (a cliente no portal não entra aqui).
create or replace function public.auditoria_registrar_entrada(p_auth text)
returns void language sql security definer set search_path = '' as $$
  insert into public.auditoria (tenant_id, branch_id, tabela, operacao, registro_id, ator_user_id, ator_nome, ator_tipo)
  select u.tenant_id, u.branch_id, 'users', 'entrou', u.id::text, u.id,
         coalesce(nullif(btrim(u.name), ''), 'Membro'), 'membro'
    from public.users u
    join public.tenants t on t.id = u.tenant_id
   where u.auth_id = p_auth
$$;

revoke execute on function public.auditoria_registrar_entrada(text) from public, anon, authenticated;
grant execute on function public.auditoria_registrar_entrada(text) to service_role;

notify pgrst, 'reload schema';
