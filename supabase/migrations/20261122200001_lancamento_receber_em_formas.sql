-- A1 da 21ª simulação (2026-11-17; a decisão de 16/11, "+ Outra forma" em todo
-- Receber à vista): o "Receber" do a receber e da parcela do crediário — no PDV
-- e na ficha — dividido em formas. A cliente paga a parcela de R$ 600 com R$ 400
-- no Pix e R$ 200 no cartão.
--
-- Como o à vista dividido (D1 da 18ª): um lançamento PAGO por forma, numa
-- transação. O lançamento em aberto fica com a primeira forma (o valor dela);
-- cada outra forma nasce como cópia dele (a mesma venda, a mesma parcela, o mesmo
-- created_at), paga, com o valor e a forma dela. Os gatilhos fazem o resto em
-- cada um (a comissão, os pontos, o recebível do cartão, a maquininha), como em
-- qualquer baixa.
--
-- O servidor confere antes (a permissão, o alcance, as vezes da rede e a
-- bandeira); aqui, de novo, o que é do banco: a rede, a receita em aberto, as
-- formas e a soma em centavos. Só o servidor chama (service_role).

create or replace function public.lancamento_receber_em_formas(p_tenant uuid, p_id uuid, p_formas jsonb, p_ator uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx      public.financial_transactions;
  v_parte   jsonb;
  v_ordem   bigint;
  v_n       integer;
  v_soma    bigint := 0;
  v_agora   timestamptz := now();
  v_metodo  text;
  v_valor   numeric;
  v_vezes   integer;
  v_bandeira text;
  v_maq     uuid;
  v_ids     uuid[] := array[]::uuid[];
  v_novo    uuid;
begin
  select f.* into v_tx
    from public.financial_transactions f
    join public.branches b on b.id = f.branch_id and b.tenant_id = p_tenant
   where f.id = p_id
   for update of f;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'P0001';
  end if;
  if v_tx.type::text <> 'INCOME' then
    raise exception 'Só a receita se recebe em mais de uma forma.' using errcode = 'P0001';
  end if;
  if v_tx.is_paid or coalesce(v_tx.notes, '') = 'Estornada' then
    raise exception 'Esse lançamento já está pago (ou foi estornado).' using errcode = 'P0001';
  end if;
  if coalesce(v_tx.sale_discount, 0) > 0 or coalesce(v_tx.loyalty_discount, 0) > 0 then
    raise exception 'Este lançamento tem desconto: receba numa forma só.' using errcode = 'P0001';
  end if;
  if p_formas is null or jsonb_typeof(p_formas) <> 'array' then
    raise exception 'Formas inválidas.' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_formas);
  if v_n < 2 or v_n > 5 then
    raise exception 'Divida em 2 a 5 formas.' using errcode = 'P0001';
  end if;

  for v_parte in select e from jsonb_array_elements(p_formas) e loop
    v_metodo := v_parte->>'forma';
    if v_metodo is null or v_metodo not in ('CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD') then
      raise exception 'Escolha a forma de cada parte.' using errcode = 'P0001';
    end if;
    v_valor := nullif(v_parte->>'valor', '')::numeric;
    if v_valor is null or round(v_valor * 100) <= 0 then
      raise exception 'Digite o valor de cada forma (acima de zero).' using errcode = 'P0001';
    end if;
    if coalesce(nullif(v_parte->>'vezes', '')::integer, 1) > 1 and v_metodo <> 'CREDIT_CARD' then
      raise exception 'As vezes no cartão são só no crédito (o débito é 1x).' using errcode = 'P0001';
    end if;
    v_soma := v_soma + round(v_valor * 100)::bigint;
  end loop;
  if v_soma <> round(v_tx.amount * 100)::bigint then
    raise exception 'As formas não fecham o valor do lançamento. Recarregue a tela.' using errcode = 'P0001';
  end if;

  for v_parte, v_ordem in select e, o from jsonb_array_elements(p_formas) with ordinality as t(e, o) loop
    v_metodo   := v_parte->>'forma';
    v_valor    := round((v_parte->>'valor')::numeric, 2);
    v_vezes    := case when v_metodo = 'CREDIT_CARD' and coalesce(nullif(v_parte->>'vezes', '')::integer, 1) >= 2
                       then (v_parte->>'vezes')::integer end;
    v_bandeira := case when v_metodo in ('DEBIT_CARD', 'CREDIT_CARD') then nullif(v_parte->>'bandeira', '') end;
    v_maq      := case when v_metodo in ('DEBIT_CARD', 'CREDIT_CARD') then nullif(v_parte->>'maquininha', '')::uuid end;

    if v_ordem = 1 then
      -- A primeira forma fica no próprio lançamento (o id que a tela conhece).
      update public.financial_transactions f set
        amount = v_valor, is_paid = true, paid_at = v_agora, updated_at = v_agora, recebido_por = p_ator,
        payment_method = v_metodo::public."PaymentMethod", cartao_vezes = v_vezes, cartao_bandeira = v_bandeira,
        maquininha_id = v_maq
       where f.id = v_tx.id;
      v_ids := v_ids || v_tx.id;
    else
      insert into public.financial_transactions (
        branch_id, cash_register_id, appointment_id, type, category, description, amount, payment_method,
        due_date, paid_at, is_paid, notes, created_by, created_at, updated_at, client_id, treatment_plan_id,
        client_package_id, procedure_sale_id, product_sale_id, credito_vendido_id,
        parcela_numero, parcela_total, parcela_grupo, vencimentos_anteriores,
        cartao_vezes, cartao_bandeira, maquininha_id, recebido_por
      ) values (
        v_tx.branch_id, v_tx.cash_register_id, v_tx.appointment_id, v_tx.type, v_tx.category, v_tx.description, v_valor,
        v_metodo::public."PaymentMethod",
        v_tx.due_date, v_agora, true, v_tx.notes, v_tx.created_by, v_tx.created_at, v_agora, v_tx.client_id, v_tx.treatment_plan_id,
        v_tx.client_package_id, v_tx.procedure_sale_id, v_tx.product_sale_id, v_tx.credito_vendido_id,
        v_tx.parcela_numero, v_tx.parcela_total, v_tx.parcela_grupo, v_tx.vencimentos_anteriores,
        v_vezes, v_bandeira, v_maq, p_ator
      ) returning id into v_novo;
      v_ids := v_ids || v_novo;
    end if;
  end loop;

  return jsonb_build_object('ids', to_jsonb(v_ids));
end
$$;

revoke execute on function public.lancamento_receber_em_formas(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.lancamento_receber_em_formas(uuid, uuid, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';
