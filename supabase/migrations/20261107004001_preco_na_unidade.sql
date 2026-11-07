-- D2 da 9ª simulação (2026-11-07; decidido pelo princípio 3): o preço por
-- unidade (procedure_branch_pricing) era salvo e nenhum caminho de preço o lia.
-- Na Menino Deus a criolipólise de R$ 590 era vendida a R$ 650.
--
-- A regra é UMA (o espelho de lib/procedimentos/preco-na-unidade.ts): o preço
-- da unidade, quando ela tem um; senão o da rede. A venda de pré-pago confere
-- o rateio contra a tabela — passa a ser a tabela DA UNIDADE da venda.
-- As duas funções partem do corpo atual da produção (pg_get_functiondef); só
-- muda a leitura do preço.

create or replace function private.preco_na_unidade(p_procedimento uuid, p_unidade uuid)
returns numeric
language sql
stable
security definer
set search_path to ''
as $$
  select round(coalesce(
    (select bp.price from public.procedure_branch_pricing bp
      where bp.procedure_id = p_procedimento and bp.branch_id = p_unidade and bp.price is not null),
    (select p.price from public.procedures p where p.id = p_procedimento),
    0), 2)
$$;
revoke execute on function private.preco_na_unidade(uuid, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.procedimento_vender(p_tenant uuid, p_cliente uuid, p_procedimento uuid, p_unidade uuid, p_ator uuid, p_quantidade integer, p_desconto numeric, p_validade_dias integer, p_lancamentos jsonb, p_unidades jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_proc     public.procedures%rowtype;
  v_venda    uuid;
  v_unitario numeric;
  v_tabela   numeric;
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido  numeric;
  v_l        jsonb;
  v_tx       uuid;
  v_agora    timestamptz := now();
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
     desconto, price, expires_at, sold_by, sold_at)
  values (
    p_tenant, p_unidade, p_cliente, p_procedimento, p_quantidade, v_unitario, v_tabela,
    v_desconto, v_vendido,
    case when p_validade_dias is null then null else v_agora + make_interval(days => p_validade_dias) end,
    p_ator, v_agora
  ) returning id into v_venda;

  insert into public.procedure_sale_units (sale_id, numero, preco)
  select v_venda, n::int, round((u ->> 'preco')::numeric, 2)
    from jsonb_array_elements(p_unidades) with ordinality as t(u, n);

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, procedure_sale_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes,
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
      left(nullif(btrim(coalesce(v_l ->> 'desconto_motivo', '')), ''), 300)
    ) returning id into v_tx;

    if jsonb_typeof(v_l -> 'parcelas') = 'array' then
      insert into public.installments (transaction_id, number, total, amount, due_date, is_paid)
      select v_tx, (p ->> 'number')::int, (p ->> 'total')::int, round((p ->> 'amount')::numeric, 2),
             (p ->> 'due_date')::timestamptz, false
        from jsonb_array_elements(v_l -> 'parcelas') p;
    end if;
  end loop;

  return v_venda;
end $function$;

CREATE OR REPLACE FUNCTION public.procedimento_vender_com_equipe(p_tenant uuid, p_cliente uuid, p_procedimento uuid, p_unidade uuid, p_ator uuid, p_vendedor uuid, p_quantidade integer, p_desconto numeric, p_validade_dias integer, p_lancamentos jsonb, p_unidades jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_proc     public.procedures%rowtype;
  v_venda    uuid;
  v_unitario numeric;
  v_tabela   numeric;
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido  numeric;
  v_l        jsonb;
  v_agora    timestamptz := now();
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

notify pgrst, 'reload schema';
