-- A17 da 11ª simulação — a comissão de venda POR PESSOA, decidida pelo
-- princípio 1 (a clínica decide; configuração com padrão que não muda nada):
-- "Comissão de venda (%)" no cadastro de comissão de cada pessoa
-- (`users.comissao_venda_pct`), VAZIO por padrão. Vale para pacote, plano,
-- pré-pago e produto, sobre o vendido, para quem está em "Quem vendeu". A
-- regra do ITEM (o "De venda" do pacote, a comissão do produto) vence a da
-- pessoa, como na execução; sem nenhuma das duas, a da CLÍNICA (o "venda de
-- plano (%)", o "venda de produto"). A linha guarda de onde veio o percentual
-- (`commission_lines.regra_de`: ITEM, PESSOA, CLINICA), e o extrato diz.
-- Liberação e cancelamento como hoje (H4; a proporção do que ficou). O crédito
-- na clínica vendido continua sem comissão de venda (decisão 1 da 9ª).
--
-- O pré-pago não tinha comissão de venda: ganha a linha PRE_PAGO SEM
-- atendimento (como a venda do plano é a linha PLANO sem atendimento), sobre o
-- vendido, que cai na proporção das unidades canceladas.

alter table public.users add column if not exists comissao_venda_pct numeric(6,2) check (comissao_venda_pct is null or (comissao_venda_pct >= 0 and comissao_venda_pct <= 100));
comment on column public.users.comissao_venda_pct is
  'A17 da 11ª: a comissão de venda da pessoa (%), vazia por padrão. A regra do item vence; sem as duas, a da clínica.';
alter table public.commission_lines add column if not exists regra_de text check (regra_de is null or regra_de in ('ITEM', 'PESSOA', 'CLINICA'));
comment on column public.commission_lines.regra_de is
  'A17 da 11ª: de onde veio o percentual da comissão de venda — do item (pacote, produto), da pessoa ou da clínica.';

create or replace function private.comissao_venda_da_pessoa(p_pessoa uuid)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select nullif(u.comissao_venda_pct, 0) from public.users u where u.id = p_pessoa
$$;
revoke execute on function private.comissao_venda_da_pessoa(uuid) from public, anon, authenticated;

-- O PACOTE: o "De venda" dele (o item); sem ele, o da pessoa.
create or replace function public.pacote_vender_com_equipe(p_tenant uuid, p_cliente uuid, p_pacote uuid, p_unidade uuid, p_ator uuid, p_vendedor uuid, p_responsavel uuid, p_lancamentos jsonb, p_sessoes jsonb, p_desconto numeric)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
     responsavel_id, comissao_responsavel_tipo, comissao_responsavel_valor, registrado_por)
  values (
    p_cliente, p_pacote, p_unidade, v_agora,
    case when v_pac.validity_days is null then null else v_agora + make_interval(days => v_pac.validity_days) end,
    v_pac.total_sessions, 0, v_vendido, round(v_pac.price, 2), v_desconto, p_vendedor,
    v_pac.comissao_venda_tipo, v_pac.comissao_venda_valor, v_pac.comissao_execucao, v_pac.comissao_execucao_valor,
    case when v_pac.comissao_responsavel_tipo is not null then p_responsavel end,
    v_pac.comissao_responsavel_tipo, v_pac.comissao_responsavel_valor, p_ator
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
  -- De VENDA, para quem vendeu: a do pacote (o item) vence a da pessoa (A17 da 11ª).
  if p_vendedor is not null and v_pac.comissao_venda_tipo is not null and coalesce(v_pac.comissao_venda_valor, 0) > 0 then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, client_package_id, regra_de)
    values (p_tenant, p_unidade, null, 0, null, p_vendedor, 'PACOTE_VENDA',
            v_pac.comissao_venda_tipo, v_pac.comissao_venda_valor, 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false),
            'PRECO', v_vendido, 0, v_cp, 'ITEM');
  elsif p_vendedor is not null and private.comissao_venda_da_pessoa(p_vendedor) > 0 then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, client_package_id, regra_de)
    values (p_tenant, p_unidade, null, 0, null, p_vendedor, 'PACOTE_VENDA',
            'PERCENTAGE', private.comissao_venda_da_pessoa(p_vendedor), 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false),
            'PRECO', v_vendido, 0, v_cp, 'PESSOA');
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
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes, cartao_bandeira,
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
      private.bandeira_do_cartao(v_l ->> 'payment_method', v_l ->> 'cartao_bandeira'),
      left(nullif(btrim(coalesce(v_l ->> 'desconto_motivo', '')), ''), 300)
    );
  end loop;

  return v_cp;
end $function$;

-- O PLANO: a da pessoa vence o "venda de plano (%)" da clínica.
create or replace function public.plano_comissao_de_venda(p_tenant uuid, p_plano uuid, p_vendedor uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_plano   public.treatment_plans%rowtype;
  v_cfg     public.commission_configs%rowtype;
  v_vendido numeric;
  v_linha   uuid;
  v_pessoa  numeric;
  v_pct     numeric;
  v_de      text;
begin
  select tp.* into v_plano
    from public.treatment_plans tp
    join public.branches b on b.id = tp.branch_id
   where tp.id = p_plano and b.tenant_id = p_tenant
   for update of tp;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'no_data_found';
  end if;
  if p_vendedor is not null and not exists (
    select 1 from public.users u where u.id = p_vendedor and u.tenant_id = p_tenant and coalesce(u.is_active, true)
  ) then
    raise exception 'Quem vendeu não é da equipe desta clínica.' using errcode = 'P0001';
  end if;

  update public.treatment_plans set vendido_por = p_vendedor where id = p_plano;

  select l.id into v_linha
    from public.commission_lines l
   where l.treatment_plan_id = p_plano and l.appointment_id is null and l.origem = 'PLANO' and l.status = 'ATIVA'
   limit 1;

  select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
  -- A17 da 11ª: a da pessoa; sem ela, a da clínica.
  v_pessoa := private.comissao_venda_da_pessoa(p_vendedor);
  v_pct    := coalesce(v_pessoa, nullif(v_cfg.plano_pct, 0));
  v_de     := case when v_pessoa is not null then 'PESSOA' else 'CLINICA' end;

  if p_vendedor is null or coalesce(v_pct, 0) <= 0 then
    -- Sem vendedora (ou sem o percentual): nenhuma comissão de venda.
    if v_linha is not null then
      update public.commission_lines set status = 'CANCELADA' where id = v_linha;
      perform private.comissao_acertar_linha(v_linha, 'Venda do plano sem vendedora', null);
    end if;
    return null;
  end if;

  select coalesce(sum(p.price), 0) into v_vendido
    from public.treatment_plan_sessions s
    join public.treatment_plan_session_procedures p on p.session_id = s.id
   where s.plan_id = p_plano;

  if v_linha is null then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, regra_de)
    values (p_tenant, v_plano.branch_id, null, 0, null, p_vendedor, 'PLANO', p_plano,
            'PERCENTAGE', v_pct, 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false),
            'PRECO', round(v_vendido, 2), 0, v_de)
    returning id into v_linha;
  else
    update public.commission_lines
       set professional_id = p_vendedor, regra_valor = v_pct, preco = round(v_vendido, 2),
           desconta_taxa = coalesce(v_cfg.desconta_taxa, false), regra_de = v_de
     where id = v_linha;
  end if;

  perform private.comissao_acertar_linha(v_linha, 'Venda do plano', null);
  return v_linha;
end $function$;

-- O PRÉ-PAGO: a linha de VENDA (sem atendimento), com a da pessoa.
create or replace function public.procedimento_vender_com_equipe(p_tenant uuid, p_cliente uuid, p_procedimento uuid, p_unidade uuid, p_ator uuid, p_vendedor uuid, p_quantidade integer, p_desconto numeric, p_validade_dias integer, p_lancamentos jsonb, p_unidades jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_proc     public.procedures%rowtype;
  v_venda    uuid;
  v_unitario numeric;
  v_tabela   numeric;
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido  numeric;
  v_l        jsonb;
  v_agora    timestamptz := now();
  v_pessoa   numeric;
begin
  select * into v_proc from public.procedures p where p.id = p_procedimento and p.tenant_id = p_tenant;
  if not found then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  if not coalesce(v_proc.is_active, true) then
    raise exception 'Este procedimento está desativado.' using errcode = 'P0001';
  end if;
  if v_proc.branch_id is not null and v_proc.branch_id <> p_unidade then
    raise exception 'Este procedimento é de outra unidade.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant) then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;
  if p_vendedor is not null and not exists (
    select 1 from public.users u where u.id = p_vendedor and u.tenant_id = p_tenant and coalesce(u.is_active, true)
  ) then
    raise exception 'Quem vendeu não é da equipe desta clínica.' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then
    raise exception 'Quantidade inválida (de 1 a 100).' using errcode = 'P0001';
  end if;
  if p_validade_dias is not null and (p_validade_dias < 1 or p_validade_dias > 3650) then
    raise exception 'Validade inválida.' using errcode = 'P0001';
  end if;

  -- O preço DA UNIDADE da venda (D2 da 9ª).
  v_unitario := private.preco_na_unidade(p_procedimento, p_unidade);
  v_tabela := v_unitario * p_quantidade;
  if v_desconto < 0 or v_desconto > v_tabela then
    raise exception 'O desconto não pode ser maior que o valor da venda.' using errcode = 'P0001';
  end if;
  v_vendido := v_tabela - v_desconto;

  if (select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l) <> v_vendido then
    raise exception 'O pagamento não fecha com o valor da venda.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_unidades) <> 'array' or jsonb_array_length(p_unidades) <> p_quantidade
     or exists (select 1 from jsonb_array_elements(p_unidades) u where round((u ->> 'preco')::numeric, 2) < 0)
     or (select coalesce(sum(round((u ->> 'preco')::numeric, 2)), 0) from jsonb_array_elements(p_unidades) u) <> v_vendido then
    raise exception 'O rateio das unidades não fecha com o valor da venda.' using errcode = 'P0001';
  end if;

  insert into public.procedure_sales
    (tenant_id, branch_id, client_id, procedure_id, quantity, preco_unitario_tabela, preco_tabela,
     desconto, price, expires_at, sold_by, sold_at, registrado_por)
  values (
    p_tenant, p_unidade, p_cliente, p_procedimento, p_quantidade, v_unitario, v_tabela,
    v_desconto, v_vendido,
    case when p_validade_dias is null then null else v_agora + make_interval(days => p_validade_dias) end,
    p_vendedor, v_agora, p_ator
  ) returning id into v_venda;

  insert into public.procedure_sale_units (sale_id, numero, preco)
  select v_venda, n::int, round((u ->> 'preco')::numeric, 2)
    from jsonb_array_elements(p_unidades) with ordinality as t(u, n);

  -- A17 da 11ª: a comissão de VENDA do pré-pago é a da pessoa (não há regra do
  -- item nem da clínica para ele) — a linha sem atendimento, sobre o vendido,
  -- antes do dinheiro (o gatilho do lançamento a acerta).
  v_pessoa := private.comissao_venda_da_pessoa(p_vendedor);
  if p_vendedor is not null and coalesce(v_pessoa, 0) > 0 and v_vendido > 0 then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, procedure_sale_id, regra_de)
    values (p_tenant, p_unidade, null, 0, p_procedimento, p_vendedor, 'PRE_PAGO',
            'PERCENTAGE', v_pessoa, 'INTEGRAL', false,
            coalesce((select c.desconta_taxa from public.commission_configs c where c.tenant_id = p_tenant), false),
            'PRECO', v_vendido, 0, v_venda, 'PESSOA');
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, procedure_sale_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes, cartao_bandeira,
       desconto_motivo)
    values (
      p_unidade, p_cliente, v_venda, 'INCOME', 'Serviços',
      'Procedimento pré-pago — ' || p_quantidade || '× ' || v_proc.name || coalesce(' — ' || nullif(v_l ->> 'sufixo', ''), ''),
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
      private.bandeira_do_cartao(v_l ->> 'payment_method', v_l ->> 'cartao_bandeira'),
      left(nullif(btrim(coalesce(v_l ->> 'desconto_motivo', '')), ''), 300)
    );
  end loop;

  return v_venda;
end $function$;

-- O PRODUTO, o pré-pago na conta e no fator: partindo do corpo ATUAL, os trechos.
do $do$
declare
  v_def  text;
  v_def2 text;
  v_novo text;
begin
  -- produto_vender_itens: por produto, a do produto (o item) > a da pessoa > a geral da clínica;
  -- sobre o total, a da pessoa > a da clínica.
  v_def := pg_get_functiondef('public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)'::regprocedure);
  v_novo := v_def;
  v_def2 := v_novo;
  v_novo := replace(v_novo,
$a$      else
        v_rtipo  := 'PERCENTAGE';
        v_rvalor := coalesce(v_cfg.produto_pct, 0);
      end if;$a$,
$b$      elsif private.comissao_venda_da_pessoa(p_vendedor) > 0 then
        -- A17 da 11ª: sem a do produto, a da pessoa; sem as duas, a da clínica.
        v_rtipo  := 'PERCENTAGE';
        v_rvalor := private.comissao_venda_da_pessoa(p_vendedor);
      else
        v_rtipo  := 'PERCENTAGE';
        v_rvalor := coalesce(v_cfg.produto_pct, 0);
      end if;$b$);
  if v_novo = v_def2 then raise exception 'produto_vender_itens: o trecho da regra por produto mudou.'; end if;
  v_def2 := v_novo;
  v_novo := replace(v_novo,
$a$         regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, product_sale_id)
      values (p_tenant, p_unidade, null, v_ci.sort_order, null, p_vendedor, 'PRODUTO',
              v_rtipo::public."CommissionType", v_rvalor, 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false), 'PRECO',
              v_parte, 0, v_venda);$a$,
$b$         regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, product_sale_id, regra_de)
      values (p_tenant, p_unidade, null, v_ci.sort_order, null, p_vendedor, 'PRODUTO',
              v_rtipo::public."CommissionType", v_rvalor, 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false), 'PRECO',
              v_parte, 0, v_venda,
              case when v_ci.comissao_tipo is not null then 'ITEM'
                   when private.comissao_venda_da_pessoa(p_vendedor) > 0 then 'PESSOA' else 'CLINICA' end);$b$);
  if v_novo = v_def2 then raise exception 'produto_vender_itens: o insert por produto mudou.'; end if;
  v_def2 := v_novo;
  v_novo := replace(v_novo,
$a$  elsif p_vendedor is not null and coalesce(v_cfg.produto_pct, 0) > 0 then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, product_sale_id)
    values (p_tenant, p_unidade, null, 0, null, p_vendedor, 'PRODUTO',
            'PERCENTAGE', v_cfg.produto_pct, 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false), 'PRECO', v_vendido, 0, v_venda);
  end if;$a$,
$b$  elsif p_vendedor is not null and coalesce(private.comissao_venda_da_pessoa(p_vendedor), v_cfg.produto_pct, 0) > 0 then
    -- A17 da 11ª: a da pessoa vence a regra sobre o total da clínica.
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, product_sale_id, regra_de)
    values (p_tenant, p_unidade, null, 0, null, p_vendedor, 'PRODUTO',
            'PERCENTAGE', coalesce(private.comissao_venda_da_pessoa(p_vendedor), v_cfg.produto_pct), 'INTEGRAL', false,
            coalesce(v_cfg.desconta_taxa, false), 'PRECO', v_vendido, 0, v_venda,
            case when private.comissao_venda_da_pessoa(p_vendedor) is not null then 'PESSOA' else 'CLINICA' end);
  end if;$b$);
  if v_novo = v_def2 then
    raise exception 'produto_vender_itens: o trecho da regra sobre o total mudou — revise a migration.';
  end if;
  execute v_novo;

  -- comissao_conta_detalhe: a linha de VENDA do pré-pago cai na proporção das unidades canceladas.
  v_def := pg_get_functiondef('private.comissao_conta_detalhe(uuid)'::regprocedure);
  v_novo := replace(v_def,
$a$  previsto   := v_valor;$a$,
$b$  -- A17 da 11ª: a de VENDA do pré-pago (a linha sem atendimento), na proporção
  -- do que ficou (o vendido menos as unidades canceladas), como a do pacote.
  if v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null and v_l.appointment_id is null then
    select case when coalesce(ps.price, 0) > 0
                then greatest(ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                                    where u.sale_id = ps.id and u.status = 'CANCELADA'), 0), 0) / ps.price
                else 1 end
      into v_fica
      from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

  previsto   := v_valor;$b$);
  if v_novo = v_def then
    raise exception 'comissao_conta_detalhe: o trecho mudou — revise a migration.';
  end if;
  execute v_novo;

  -- comissao_fator_em: o mesmo fator, no instante de cada lançamento (D7 da 11ª).
  v_def := pg_get_functiondef('private.comissao_fator_em(uuid,timestamptz)'::regprocedure);
  v_novo := replace(v_def,
$a$    end if;
  end if;

  return coalesce(v_fator, 1);$a$,
$b$    end if;

  elsif v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null and v_l.appointment_id is null then
    select case when coalesce(ps.price, 0) > 0
                then greatest(ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                                    where u.sale_id = ps.id and u.status = 'CANCELADA'
                                                      and u.cancelled_at <= p_quando), 0), 0) / ps.price
                else 1 end
      into v_fator
      from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
  end if;

  return coalesce(v_fator, 1);$b$);
  if v_novo = v_def then
    raise exception 'comissao_fator_em: o trecho mudou — revise a migration.';
  end if;
  execute v_novo;
end $do$;

-- O extrato com a origem da regra (A17) e a venda do pré-pago nomeada. É o
-- comissoes_extrato_com_base com duas colunas a mais (o tipo de retorno não
-- muda numa função existente: a de antes fica sem chamador no app).
create or replace function public.comissoes_extrato_com_regra(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
 returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric, pacote text, desconta_taxa boolean, desconta_insumos boolean, previsto numeric, base_com_pontos text, plano text, base numeric, base_desconto numeric, base_taxa numeric, base_insumos numeric, base_fator numeric, regra_de text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with itens as (
    select c.id, c.professional_id, c.branch_id, c.released_at, c.kind, c.motivo, c.amount,
           c.status::text as status, c.payout_id, c.appointment_id, c.line_id, null::numeric as previsto
      from public.commissions c
      join public.branches b on b.id = c.branch_id
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
       and (p_profissional is null or c.professional_id = p_profissional)
       and (c.released_at between p_inicio and p_fim
            or (c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim))
    union all
    select g.line_id, g.professional_id, g.branch_id, g.desde, 'AGUARDANDO', 'Aguardando o pagamento integral', 0::numeric,
           'AGUARDANDO', null::uuid, l.appointment_id, g.line_id, g.previsto
      from private.comissoes_aguardando(p_tenant, p_branch_ids, p_fim, p_profissional) g
      join public.commission_lines l on l.id = g.line_id
  )
  select x.id, x.professional_id, x.branch_id, x.released_at, x.kind, x.motivo,
         x.amount, x.status, x.payout_id, x.appointment_id, coalesce(a.scheduled_at, ps.sold_at, cp.purchased_at, tp.aceito_em, psv.sold_at),
         coalesce(cli.name, cps.name, ccp.name, ctp.name, cpsv.name), coalesce(pr.name, ps.descricao, prod.name, sp.name, tp.name),
         case when l.pacote_responsavel then 'PACOTE_RESPONSAVEL'
              when tp.id is not null then 'PLANO_VENDA'
              when l.origem = 'PRE_PAGO' and l.appointment_id is null and l.procedure_sale_id is not null then 'PRE_PAGO_VENDA'
              else l.origem end,
         l.preco, l.regra_tipo::text, l.regra_valor,
         sp.name, l.desconta_taxa, l.desconta_insumos, x.previsto, l.base_com_pontos, tp.name,
         case when d.base is null then null
              when f.fator = d.base_fator then d.base
              else round(greatest(l.preco - d.base_desconto - d.base_taxa - d.base_insumos, 0) * f.fator, 2) end,
         d.base_desconto, d.base_taxa, d.base_insumos,
         case when d.base is null then d.base_fator else f.fator end,
         l.regra_de
    from itens x
    left join public.commission_lines l on l.id = x.line_id
    left join lateral private.comissao_conta_detalhe(l.id) d on l.id is not null
    left join lateral (
      select case when l.id is null or x.kind = 'AGUARDANDO' or coalesce(d.base_fator, 1) = 1 then coalesce(d.base_fator, 1)
                  else private.comissao_fator_em(l.id, x.released_at) end as fator
    ) f on true
    left join public.appointments a on a.id = x.appointment_id
    left join public.clients cli on cli.id = a.client_id
    left join public.procedures pr on pr.id = coalesce(l.procedure_id, a.procedure_id)
    left join public.product_sales ps on ps.id = l.product_sale_id
    left join public.clients cps on cps.id = ps.client_id
    left join public.products prod on prod.id = ps.product_id
    left join public.client_packages cp on cp.id = l.client_package_id
    left join public.service_packages sp on sp.id = cp.package_id
    left join public.clients ccp on ccp.id = cp.client_id
    left join public.treatment_plans tp on tp.id = l.treatment_plan_id and l.appointment_id is null and l.origem = 'PLANO'
    left join public.clients ctp on ctp.id = tp.client_id
    left join public.procedure_sales psv on psv.id = l.procedure_sale_id and l.appointment_id is null
    left join public.clients cpsv on cpsv.id = psv.client_id
   order by x.released_at desc, x.id
$function$;

revoke execute on function public.comissoes_extrato_com_regra(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_extrato_com_regra(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
