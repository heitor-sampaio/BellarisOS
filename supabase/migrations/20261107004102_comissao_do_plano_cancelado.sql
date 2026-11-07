-- D4 da 9ª simulação (decisão 2 do Heitor, 2026-11-07: o plano cancelado
-- segue a regra do pacote). A comissão do plano CANCELADO, como a do pacote
-- (F2b, comissoes.md):
--  - o plano passa a valer o USADO (a soma dos procedimentos menos
--    `treatment_plans.valor_cancelado`): é contra ele que a quitação confere,
--    e o crediário que caiu não deixa a comissão esperando para sempre;
--  - a de VENDA (a linha PLANO sem atendimento) volta na proporção do que foi
--    cancelado — o previsto também, para não liberar sobre o que caiu;
--  - a de EXECUÇÃO das sessões feitas fica.
-- O plano cancelado ANTES desta regra (sem `valor_cancelado`) segue como
-- estava: a linha de venda dele já foi CANCELADA por plano_cancelar_comissao_de_venda.
-- O resto do corpo é o da produção.

CREATE OR REPLACE FUNCTION private.comissao_conta(p_linha uuid, OUT alvo numeric, OUT previsto numeric, OUT quitado boolean)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_l         public.commission_lines%rowtype;
  v_fracao    numeric := 1;
  v_desconto  numeric := 0;
  v_taxa      numeric := 0;
  v_base      numeric;
  v_valor     numeric;
  v_pago      boolean := false;
  v_estornado boolean := false;
  v_metodo    text;
  v_vezes     int;
  v_bandeira  text;
  v_total     numeric;
  v_recebido  numeric;
  v_quitado   numeric;
  v_dvenda    numeric := 0;
  v_fica      numeric;
  v_cheio     numeric;
begin
  alvo := 0; previsto := 0; quitado := false;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return;
  end if;
  quitado := true;

  if v_l.origem = 'AVULSO' then
    select f.is_paid and coalesce(f.notes, '') <> 'Estornada',
           coalesce(f.notes, '') = 'Estornada',
           coalesce(f.loyalty_discount, 0),
           f.payment_method::text,
           coalesce(f.sale_discount, 0),
           f.cartao_vezes,
           f.cartao_bandeira
      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes, v_bandeira
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME'
     order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
     limit 1;
    v_pago      := coalesce(v_pago, false);
    v_estornado := coalesce(v_estornado, false);
    if v_pago then
      v_taxa := private.comissao_taxa_pct(v_l.tenant_id, v_metodo, coalesce(v_vezes, 1), v_bandeira);
    else
      v_desconto := 0;
      v_dvenda   := 0;
    end if;
    v_dvenda := coalesce(v_dvenda, 0);
    quitado  := v_pago;
    v_fracao := case
      when v_l.modo in ('PAGAMENTO', 'INTEGRAL') then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    -- PAGAMENTO era sempre "sobre o pago"; INTEGRAL e ATENDIMENTO seguem a
    -- base com pontos da configuração (retratada na linha).
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and v_l.client_package_id is not null)
        or (v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null)
        or (v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null) then
    if v_l.origem = 'PLANO' then
      -- O plano cancelado vale o que foi usado (D4 da 9ª, a regra do pacote):
      -- a soma dos procedimentos menos as sessões canceladas.
      select coalesce(sum(p.price), 0) into v_total
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
       where s.plan_id = v_l.treatment_plan_id;
      v_total := v_total - coalesce((select tp.valor_cancelado from public.treatment_plans tp where tp.id = v_l.treatment_plan_id), 0);
    elsif v_l.origem in ('PACOTE', 'PACOTE_VENDA') then
      -- O pacote cancelado vale o que foi usado (F2b): o preço vendido menos
      -- as sessões canceladas.
      select cp.price - coalesce(cp.valor_cancelado, 0) into v_total
        from public.client_packages cp where cp.id = v_l.client_package_id;
    elsif v_l.origem = 'PRODUTO' then
      -- A devolução em parte (A34 da 8ª): a venda vale o vendido menos o devolvido.
      select ps.price - coalesce(ps.valor_devolvido, 0) into v_total from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0)
        into v_total
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;
    select coalesce(sum(f.amount), 0),
           -- Pontos são forma de pagamento: quitam como o dinheiro.
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0)), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1), f.cartao_bandeira))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_quitado, v_taxa
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id)
         or (v_l.origem = 'PRODUTO' and f.product_sale_id = v_l.product_sale_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    -- Sem preço de venda (o pacote de antes da venda no sistema): libera na conclusão, como sempre.
    quitado := v_total is null or v_total <= 0 or round(v_quitado, 2) >= round(v_total, 2);
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    elsif v_l.modo = 'INTEGRAL' then
      v_fracao := case when quitado then 1 else 0 end;
    end if;

  else
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
  else
    v_base := v_l.preco - least(v_desconto + v_dvenda, v_l.preco);
    if v_l.desconta_taxa then
      v_base := v_base - round(v_base * v_taxa / 100, 2);
    end if;
    if v_l.desconta_insumos then
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_valor := round(greatest(v_base, 0) * v_l.regra_valor / 100, 2);
  end if;

  -- A comissão de VENDA do pacote cancelado volta na proporção do que foi
  -- cancelado (F2b) — o previsto também, para não liberar sobre o que caiu.
  if v_l.origem = 'PACOTE_VENDA' and v_l.client_package_id is not null then
    select case when coalesce(cp.price, 0) > 0
                then greatest(cp.price - coalesce(cp.valor_cancelado, 0), 0) / cp.price
                else 1 end
      into v_fica
      from public.client_packages cp where cp.id = v_l.client_package_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
  end if;

  -- A comissão de VENDA do plano cancelado (a linha PLANO sem atendimento),
  -- igual (D4 da 9ª): na proporção do que ficou.
  if v_l.origem = 'PLANO' and v_l.appointment_id is null then
    select coalesce(sum(p.price), 0) into v_cheio
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = v_l.treatment_plan_id;
    select case when v_cheio > 0
                then greatest(v_cheio - coalesce(tp.valor_cancelado, 0), 0) / v_cheio
                else 1 end
      into v_fica
      from public.treatment_plans tp where tp.id = v_l.treatment_plan_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
  end if;

  -- A da venda de PRODUTO com devolução em parte (A34 da 8ª): a linha do
  -- total na proporção do que a venda passou a valer; a de um item (o "por
  -- produto"), na do que ficou daquele item.
  if v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null then
    if coalesce(v_l.item, 0) = 0 then
      select case when coalesce(ps.price, 0) > 0
                  then greatest(ps.price - coalesce(ps.valor_devolvido, 0), 0) / ps.price
                  else 1 end
        into v_fica
        from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select case when coalesce(v_l.preco, 0) > 0
                  then greatest(v_l.preco - coalesce(i.valor_devolvido, 0), 0) / v_l.preco
                  else 1 end
        into v_fica
        from public.product_sale_items i where i.sale_id = v_l.product_sale_id and i.sort_order = v_l.item;
    end if;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
  end if;

  previsto := v_valor;
  alvo     := round(v_valor * v_fracao, 2);
end $function$;

notify pgrst, 'reload schema';
