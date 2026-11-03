-- com-04 da revisão das decisões (2026-11-02). O Heitor: "se foi vendido um
-- pacote de 900, Renata recebe a comissão sobre o valor do pacote, no momento
-- em que o pagamento integral do pacote foi realizado (...) mas devemos manter
-- o sistema com a maior flexibilidade possível e a rede define como operar."
--
-- A comissão de quem ATENDE o pacote ganha a opção "Valor do pacote": em vez
-- de uma linha por sessão feita (REGRA, PERCENTAGE, FIXED_AMOUNT, NENHUMA — o
-- de antes), UMA linha sobre o valor vendido do pacote, para a PROFISSIONAL
-- RESPONSÁVEL escolhida na venda.
--
-- - No cadastro: `comissao_responsavel_tipo`/`_valor` (% ou R$ fixo); com
--   eles, `comissao_execucao` fica NENHUMA (as sessões não geram linha).
-- - Na venda: o retrato em `client_packages` e quem é a responsável
--   (`responsavel_id`). A linha é `origem = 'PACOTE_VENDA'` com
--   `pacote_responsavel = true`: a mesma conta da comissão de venda do pacote
--   (`private.comissao_conta`) — libera com o pacote pago INTEIRO (H4: o
--   crediário espera a última parcela, o cartão em N vezes é na hora) e cai na
--   proporção do que for cancelado (F2b). Nenhuma conta nova.

alter table public.service_packages
  add column if not exists comissao_responsavel_tipo public."CommissionType",
  add column if not exists comissao_responsavel_valor numeric;
alter table public.service_packages
  add constraint service_packages_comissao_responsavel_check check (
    comissao_responsavel_tipo is null
    or (comissao_responsavel_valor is not null and comissao_responsavel_valor >= 0
        and (comissao_responsavel_tipo <> 'PERCENTAGE' or comissao_responsavel_valor <= 100)
        and comissao_execucao = 'NENHUMA')
  );

alter table public.client_packages
  add column if not exists responsavel_id uuid references public.users(id) on delete set null,
  add column if not exists comissao_responsavel_tipo public."CommissionType",
  add column if not exists comissao_responsavel_valor numeric;

alter table public.commission_lines
  add column if not exists pacote_responsavel boolean not null default false;

-- O cadastro do pacote aceita a execução "PACOTE" (sobre o valor do pacote,
-- `valorTipo` + `valor`): grava o retrato da responsável e a execução NENHUMA.
-- Três trocas no corpo da produção de `pacote_salvar`.
do $do$
declare v text;
begin
  v := pg_get_functiondef('public.pacote_salvar(uuid,uuid,text,numeric,integer,boolean,jsonb,jsonb)'::regprocedure);
  if position('  v_evalor numeric;' || chr(10) || 'begin' in v) = 0
     or position('comissao_execucao, comissao_execucao_valor)' || chr(10) || '    values (p_tenant, null, v_prim,' in v) = 0
     or position(', coalesce(v_etipo, ''REGRA''), v_evalor)' in v) = 0
     or position('comissao_execucao_valor = case when p_comissao is null then comissao_execucao_valor else v_evalor end' in v) = 0
     or position('    v_evalor := case when v_etipo in (''PERCENTAGE'', ''FIXED_AMOUNT'') then round((p_comissao #>> ''{execucao,valor}'')::numeric, 2) end;' in v) = 0 then
    raise exception 'pacote_salvar: corpo inesperado';
  end if;
  v := replace(v, '  v_evalor numeric;' || chr(10) || 'begin',
    '  v_evalor numeric;' || chr(10) || '  v_rtipo  text;' || chr(10) || '  v_rvalor numeric;' || chr(10) || 'begin');
  v := replace(v, '    v_evalor := case when v_etipo in (''PERCENTAGE'', ''FIXED_AMOUNT'') then round((p_comissao #>> ''{execucao,valor}'')::numeric, 2) end;',
    '    v_evalor := case when v_etipo in (''PERCENTAGE'', ''FIXED_AMOUNT'') then round((p_comissao #>> ''{execucao,valor}'')::numeric, 2) end;' || chr(10) ||
    '    -- com-04: "sobre o valor do pacote", para a profissional responsável da venda.' || chr(10) ||
    '    if v_etipo = ''PACOTE'' then' || chr(10) ||
    '      v_rtipo  := nullif(p_comissao #>> ''{execucao,valorTipo}'', '''');' || chr(10) ||
    '      v_rvalor := round((p_comissao #>> ''{execucao,valor}'')::numeric, 2);' || chr(10) ||
    '      if v_rtipo is null or v_rtipo not in (''PERCENTAGE'', ''FIXED_AMOUNT'') or v_rvalor is null or v_rvalor < 0' || chr(10) ||
    '         or (v_rtipo = ''PERCENTAGE'' and v_rvalor > 100) then' || chr(10) ||
    '        raise exception ''Valor de comissão inválido (o percentual vai de 0 a 100).'' using errcode = ''P0001'';' || chr(10) ||
    '      end if;' || chr(10) ||
    '      v_etipo  := ''NENHUMA'';' || chr(10) ||
    '      v_evalor := null;' || chr(10) ||
    '    end if;');
  v := replace(v, 'comissao_execucao, comissao_execucao_valor)' || chr(10) || '    values (p_tenant, null, v_prim,',
    'comissao_execucao, comissao_execucao_valor, comissao_responsavel_tipo, comissao_responsavel_valor)' || chr(10) || '    values (p_tenant, null, v_prim,');
  v := replace(v, ', coalesce(v_etipo, ''REGRA''), v_evalor)',
    ', coalesce(v_etipo, ''REGRA''), v_evalor, v_rtipo::public."CommissionType", v_rvalor)');
  v := replace(v, 'comissao_execucao_valor = case when p_comissao is null then comissao_execucao_valor else v_evalor end',
    'comissao_execucao_valor = case when p_comissao is null then comissao_execucao_valor else v_evalor end,' || chr(10) ||
    '           comissao_responsavel_tipo  = case when p_comissao is null then comissao_responsavel_tipo else v_rtipo::public."CommissionType" end,' || chr(10) ||
    '           comissao_responsavel_valor = case when p_comissao is null then comissao_responsavel_valor else v_rvalor end');
  execute v;
end $do$;

-- A venda do pacote com a EQUIPE da venda: quem vendeu (`p_vendedor`: a
-- comissão de venda e as Vendas) e a profissional responsável
-- (`p_responsavel`: a comissão de quem atende sobre o valor do pacote, quando o
-- pacote diz). `p_ator` é quem registrou (o lançamento). O corpo é o de
-- `pacote_vender` da produção (com o motivo do desconto de 20261101001102),
-- mais a equipe.
create or replace function public.pacote_vender_com_equipe(
  p_tenant uuid, p_cliente uuid, p_pacote uuid, p_unidade uuid, p_ator uuid,
  p_vendedor uuid, p_responsavel uuid,
  p_lancamentos jsonb, p_sessoes jsonb, p_desconto numeric
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pac      public.service_packages%rowtype;
  v_nome     text;
  v_cp       uuid;
  v_soma     numeric;
  v_l        jsonb;
  v_agora    timestamptz := now();
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido  numeric;
  v_cfg      public.commission_configs%rowtype;
begin
  select * into v_pac from public.service_packages sp where sp.id = p_pacote and sp.tenant_id = p_tenant;
  if not found then
    raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
  end if;
  if not v_pac.is_active then
    raise exception 'Este pacote está desativado.' using errcode = 'P0001';
  end if;
  if v_pac.branch_id is not null and v_pac.branch_id <> p_unidade then
    raise exception 'Este pacote é de outra unidade.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select c.name into v_nome from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;
  if p_vendedor is not null and not exists (
    select 1 from public.users u where u.id = p_vendedor and u.tenant_id = p_tenant and coalesce(u.is_active, true)
  ) then
    raise exception 'Quem vendeu não é da equipe desta clínica.' using errcode = 'P0001';
  end if;
  if p_responsavel is not null and not exists (
    select 1 from public.users u where u.id = p_responsavel and u.tenant_id = p_tenant and coalesce(u.is_active, true)
  ) then
    raise exception 'A profissional responsável não é da equipe desta clínica.' using errcode = 'P0001';
  end if;

  if v_desconto < 0 or v_desconto > round(v_pac.price, 2) then
    raise exception 'O desconto não pode ser maior que o preço do pacote.' using errcode = 'P0001';
  end if;
  v_vendido := round(v_pac.price, 2) - v_desconto;

  select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) into v_soma
    from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l;
  if v_soma <> v_vendido then
    raise exception 'O pagamento não fecha com o preço do pacote.' using errcode = 'P0001';
  end if;

  if p_sessoes is not null then
    if exists (
      select 1 from (
        select i.procedure_id, sum(i.quantity) quantity from public.service_package_items i where i.package_id = p_pacote group by 1
      ) itens
      full join (
        select (s ->> 'procedure_id')::uuid procedure_id, count(*) n from jsonb_array_elements(p_sessoes) s group by 1
      ) sess on sess.procedure_id = itens.procedure_id
       where coalesce(itens.quantity, 0) <> coalesce(sess.n, 0)
    ) then
      raise exception 'As sessões não batem com os procedimentos do pacote.' using errcode = 'P0001';
    end if;
    if (select coalesce(sum(round((s ->> 'preco')::numeric, 2)), 0) from jsonb_array_elements(p_sessoes) s) <> v_vendido then
      raise exception 'O rateio das sessões não fecha com o preço do pacote.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.client_packages
    (client_id, package_id, branch_id, purchased_at, expires_at, total_sessions, used_sessions,
     price, preco_tabela, desconto, sold_by,
     comissao_venda_tipo, comissao_venda_valor, comissao_execucao, comissao_execucao_valor,
     responsavel_id, comissao_responsavel_tipo, comissao_responsavel_valor)
  values (
    p_cliente, p_pacote, p_unidade, v_agora,
    case when v_pac.validity_days is null then null else v_agora + make_interval(days => v_pac.validity_days) end,
    v_pac.total_sessions, 0, v_vendido, round(v_pac.price, 2), v_desconto, p_vendedor,
    v_pac.comissao_venda_tipo, v_pac.comissao_venda_valor, v_pac.comissao_execucao, v_pac.comissao_execucao_valor,
    case when v_pac.comissao_responsavel_tipo is not null then p_responsavel end,
    v_pac.comissao_responsavel_tipo, v_pac.comissao_responsavel_valor
  ) returning id into v_cp;

  if p_sessoes is not null then
    insert into public.package_sessions (client_package_id, status, session_number, procedure_id, preco)
    select v_cp, 'AVAILABLE', n::int, (s ->> 'procedure_id')::uuid, round((s ->> 'preco')::numeric, 2)
      from jsonb_array_elements(p_sessoes) with ordinality as t(s, n);
  else
    insert into public.package_sessions (client_package_id, status, session_number, procedure_id)
    select v_cp, 'AVAILABLE', row_number() over (order by i.sort_order, g)::int, i.procedure_id
      from public.service_package_items i
      cross join lateral generate_series(1, i.quantity) g
     where i.package_id = p_pacote;
  end if;

  -- As comissões nascem ANTES do dinheiro — o gatilho do lançamento já as
  -- acerta (à vista, na hora; a receber, com a última parcela).
  select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
  -- De VENDA, para quem vendeu.
  if p_vendedor is not null and v_pac.comissao_venda_tipo is not null and coalesce(v_pac.comissao_venda_valor, 0) > 0 then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, client_package_id)
    values (p_tenant, p_unidade, null, 0, null, p_vendedor, 'PACOTE_VENDA',
            v_pac.comissao_venda_tipo, v_pac.comissao_venda_valor, 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false),
            'PRECO', v_vendido, 0, v_cp);
  end if;
  -- De quem ATENDE, sobre o valor do pacote, para a responsável (com-04).
  if p_responsavel is not null and v_pac.comissao_responsavel_tipo is not null and coalesce(v_pac.comissao_responsavel_valor, 0) > 0 then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, client_package_id,
       pacote_responsavel)
    values (p_tenant, p_unidade, null, 1, null, p_responsavel, 'PACOTE_VENDA',
            v_pac.comissao_responsavel_tipo, v_pac.comissao_responsavel_valor, 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false),
            'PRECO', v_vendido, 0, v_cp, true);
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, client_package_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes,
       desconto_motivo)
    values (
      p_unidade, p_cliente, v_cp, 'INCOME', 'Serviços', 'Pacote — ' || v_pac.name || coalesce(' — ' || nullif(v_l ->> 'sufixo', ''), ''),
      round((v_l ->> 'amount')::numeric, 2),
      nullif(v_l ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l ->> 'is_paid')::boolean, false),
      case when coalesce((v_l ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l ->> 'due_date', '')::timestamptz,
      nullif(v_l ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema'),
      nullif(v_l ->> 'parcela_numero', '')::int,
      nullif(v_l ->> 'parcela_total', '')::int,
      nullif(v_l ->> 'parcela_grupo', '')::uuid,
      nullif(v_l ->> 'cartao_vezes', '')::smallint,
      left(nullif(btrim(coalesce(v_l ->> 'desconto_motivo', '')), ''), 300)
    );
  end loop;

  return v_cp;
end $$;

revoke execute on function public.pacote_vender_com_equipe(uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.pacote_vender_com_equipe(uuid, uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, numeric) to service_role;

-- O extrato diz que a linha é da responsável: a origem sai PACOTE_RESPONSAVEL.
do $do$
declare v text;
begin
  v := pg_get_functiondef('public.comissoes_extrato(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure);
  if position('coalesce(pr.name, ps.descricao, prod.name, sp.name), l.origem, l.preco' in v) = 0 then
    raise exception 'comissoes_extrato: corpo inesperado';
  end if;
  execute replace(v, 'coalesce(pr.name, ps.descricao, prod.name, sp.name), l.origem, l.preco',
    'coalesce(pr.name, ps.descricao, prod.name, sp.name), case when l.pacote_responsavel then ''PACOTE_RESPONSAVEL'' else l.origem end, l.preco');
end $do$;

notify pgrst, 'reload schema';
