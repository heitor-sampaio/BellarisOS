-- com-06 da revisão das decisões (2026-11-02). O Heitor: "às vezes quem vai
-- registrar a venda é recepção e quem vendeu foi a profissional, então,
-- pensando na flexibilidade, um campo para informar quem foi quem realizou
-- aquela venda. Se o campo ficar vazio, aviso e confirmação. Campo vazio não
-- gera comissão para ninguém."
--
-- `sold_by` continua sendo QUEM VENDEU (a comissão da venda, a coluna
-- Profissional das Vendas, o "Meu faturamento") — agora escolhido na tela, e
-- pode ficar vazio. Quem REGISTROU a venda vai para `registrado_por`.

alter table public.product_sales   add column if not exists registrado_por uuid references public.users(id) on delete set null;
alter table public.client_packages add column if not exists registrado_por uuid references public.users(id) on delete set null;
alter table public.procedure_sales add column if not exists registrado_por uuid references public.users(id) on delete set null;

-- A venda de produto e a de pacote gravam quem registrou (uma troca no corpo
-- de cada uma; `p_vendedor` já era o `sold_by`).
do $do$
declare v text;
begin
  v := pg_get_functiondef('public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)'::regprocedure);
  if position('custo, sold_by, sold_at, descricao)' in v) = 0
     or position('0, p_vendedor, v_agora, case when jsonb_array_length(v_itens) > 1 then v_descricao end)' in v) = 0 then
    raise exception 'produto_vender_itens: corpo inesperado';
  end if;
  v := replace(v, 'custo, sold_by, sold_at, descricao)', 'custo, sold_by, sold_at, descricao, registrado_por)');
  v := replace(v, '0, p_vendedor, v_agora, case when jsonb_array_length(v_itens) > 1 then v_descricao end)',
                  '0, p_vendedor, v_agora, case when jsonb_array_length(v_itens) > 1 then v_descricao end, p_ator)');
  execute v;

  v := pg_get_functiondef('public.pacote_vender_com_equipe(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,numeric)'::regprocedure);
  if position('responsavel_id, comissao_responsavel_tipo, comissao_responsavel_valor)' in v) = 0
     or position('v_pac.comissao_responsavel_tipo, v_pac.comissao_responsavel_valor' || chr(10) || '  ) returning id into v_cp;' in v) = 0 then
    raise exception 'pacote_vender_com_equipe: corpo inesperado';
  end if;
  v := replace(v, 'responsavel_id, comissao_responsavel_tipo, comissao_responsavel_valor)',
                  'responsavel_id, comissao_responsavel_tipo, comissao_responsavel_valor, registrado_por)');
  v := replace(v, 'v_pac.comissao_responsavel_tipo, v_pac.comissao_responsavel_valor' || chr(10) || '  ) returning id into v_cp;',
                  'v_pac.comissao_responsavel_tipo, v_pac.comissao_responsavel_valor, p_ator' || chr(10) || '  ) returning id into v_cp;');
  execute v;
end $do$;

-- O pré-pago com quem vendeu (`p_vendedor`, o `sold_by`) e quem registrou
-- (`p_ator`). O corpo é o de `procedimento_vender` da produção (com o motivo do
-- desconto de 20261101001102); a de antes fica sem uso.
create or replace function public.procedimento_vender_com_equipe(
  p_tenant uuid, p_cliente uuid, p_procedimento uuid, p_unidade uuid, p_ator uuid, p_vendedor uuid,
  p_quantidade integer, p_desconto numeric, p_validade_dias integer, p_lancamentos jsonb, p_unidades jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proc     public.procedures%rowtype;
  v_venda    uuid;
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

  v_tabela := round(coalesce(v_proc.price, 0), 2) * p_quantidade;
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
    p_tenant, p_unidade, p_cliente, p_procedimento, p_quantidade, round(coalesce(v_proc.price, 0), 2), v_tabela,
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
    );
  end loop;

  return v_venda;
end $$;

revoke execute on function public.procedimento_vender_com_equipe(uuid, uuid, uuid, uuid, uuid, uuid, integer, numeric, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.procedimento_vender_com_equipe(uuid, uuid, uuid, uuid, uuid, uuid, integer, numeric, integer, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
