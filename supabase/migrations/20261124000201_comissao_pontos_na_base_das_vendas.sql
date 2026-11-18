-- Item 10 das correções da auditoria das regras (2026-11-18) — decisão do
-- Claude pelos princípios 2 e 3, não do Heitor: na comissão, os pontos seguem a
-- escolha da rede. Com a rede em "Sobre o valor pago" (o retrato da linha,
-- `commission_lines.base_com_pontos = 'VALOR_PAGO'`), os pontos e o voucher
-- usados saem da base também no pacote (a venda e cada sessão), no plano (a
-- venda e cada procedimento executado), no pré-pago e na venda de produto. Até
-- aqui só saíam no avulso, e a escolha da rede não valia ali (comissoes.md).
--
-- A parte da linha é a proporção do preço dela no preço CHEIO da venda (a
-- sessão de R$ 200 de um pacote de R$ 800 leva 1/4 dos pontos do pacote); a
-- venda inteira (PACOTE_VENDA, a venda do plano, a do produto ou do pré-pago
-- sobre o total) leva todos. Os pontos lidos são os dos lançamentos pagos e
-- vivos da venda, a mesma régua do `quitado`: o estorno os devolve à base.
--
-- O resto da função é a definição viva (20261121000001 em diante), sem
-- mudança: o AVULSO, a quitação, a taxa, os insumos, o fator do cancelamento.
-- Nenhuma linha de venda tinha `VALOR_PAGO` quando esta entrou (conferido no
-- banco): o passado não muda de valor.

create or replace function private.comissao_conta_detalhe(p_linha uuid, OUT alvo numeric, OUT previsto numeric, OUT quitado boolean, OUT base numeric, OUT base_desconto numeric, OUT base_taxa numeric, OUT base_insumos numeric, OUT base_fator numeric)
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
  v_total     numeric;
  v_recebido  numeric;
  v_quitado   numeric;
  v_dvenda    numeric := 0;
  v_fica      numeric;
  v_cheio     numeric;
  v_fator     numeric := 1;
  v_vivos     int := 0;
  v_abertos   int := 0;
  v_fid_venda numeric := 0;
  v_cheio_venda numeric;
begin
  alvo := 0; previsto := 0; quitado := false;
  base := null; base_desconto := 0; base_taxa := 0; base_insumos := 0; base_fator := 1;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return;
  end if;
  quitado := true;

  if v_l.origem = 'AVULSO' then
    select round(coalesce(a.price, 0), 2) into v_total from public.appointments a where a.id = v_l.appointment_id;
    select count(*),
           count(*) filter (where not f.is_paid and f.amount > 0),
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0) + coalesce(f.sale_discount, 0)) filter (where f.is_paid), 0),
           coalesce(sum(f.loyalty_discount) filter (where f.is_paid), 0),
           coalesce(sum(f.sale_discount) filter (where f.is_paid), 0),
           case when coalesce(sum(f.amount) filter (where f.is_paid and f.amount > 0), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, 1), f.cartao_bandeira, f.maquininha_id)) filter (where f.is_paid and f.amount > 0)
             / sum(f.amount) filter (where f.is_paid and f.amount > 0)
           else 0 end
      into v_vivos, v_abertos, v_quitado, v_desconto, v_dvenda, v_taxa
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME' and f.estorno_de is null
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno';
    v_pago := v_vivos > 0 and v_abertos = 0 and round(v_quitado, 2) >= coalesce(v_total, 0);
    v_estornado := v_vivos = 0 and exists (
      select 1 from public.financial_transactions f
       where f.appointment_id = v_l.appointment_id and f.type = 'INCOME' and f.notes = 'Estornada');
    v_dvenda := coalesce(v_dvenda, 0);
    quitado  := v_pago;
    v_fracao := case
      when v_l.modo = 'PAGAMENTO' then
        case when coalesce(v_total, 0) <= 0 then case when v_pago then 1 else 0 end
             else least(1, v_quitado / v_total) end
      when v_l.modo = 'INTEGRAL' then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and v_l.client_package_id is not null)
        or (v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null)
        or (v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null) then
    if v_l.origem = 'PLANO' then
      select coalesce(sum(p.price), 0) into v_total
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
       where s.plan_id = v_l.treatment_plan_id;
      v_cheio_venda := v_total;
      v_total := v_total - coalesce((select tp.valor_cancelado from public.treatment_plans tp where tp.id = v_l.treatment_plan_id), 0);
    elsif v_l.origem in ('PACOTE', 'PACOTE_VENDA') then
      select cp.price - coalesce(cp.valor_cancelado, 0), cp.price into v_total, v_cheio_venda
        from public.client_packages cp where cp.id = v_l.client_package_id;
    elsif v_l.origem = 'PRODUTO' then
      select ps.price - coalesce(ps.valor_devolvido, 0), ps.price into v_total, v_cheio_venda
        from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0),
             ps.price
        into v_total, v_cheio_venda
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;
    select coalesce(sum(f.amount), 0),
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0)), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1), f.cartao_bandeira, f.maquininha_id))
             / sum(f.amount)
           else 0 end,
           coalesce(sum(f.loyalty_discount), 0)
      into v_recebido, v_quitado, v_taxa, v_fid_venda
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id)
         or (v_l.origem = 'PRODUTO' and f.product_sale_id = v_l.product_sale_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    quitado := v_total is null or v_total <= 0 or round(v_quitado, 2) >= round(v_total, 2);
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    elsif v_l.modo = 'INTEGRAL' then
      v_fracao := case when quitado then 1 else 0 end;
    end if;
    -- Item 10: a escolha da rede vale aqui também — "Sobre o valor pago" tira
    -- da base a parte desta linha nos pontos e no voucher usados na venda.
    if v_l.base_com_pontos = 'VALOR_PAGO' and coalesce(v_cheio_venda, 0) > 0 and v_fid_venda > 0 then
      v_desconto := round(v_fid_venda * least(1, v_l.preco / v_cheio_venda), 2);
    end if;

  else
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
    base_desconto := least(v_desconto, v_l.preco);
    v_base := v_l.preco - base_desconto;
  else
    base_desconto := least(v_desconto + v_dvenda, v_l.preco);
    v_base := v_l.preco - base_desconto;
    if v_l.desconta_taxa then
      base_taxa := round(v_base * v_taxa / 100, 2);
      v_base := v_base - base_taxa;
    end if;
    if v_l.desconta_insumos then
      base_insumos := v_l.custo_insumos;
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_base := greatest(v_base, 0);
    v_valor := round(v_base * v_l.regra_valor / 100, 2);
  end if;

  if v_l.origem = 'PACOTE_VENDA' and v_l.client_package_id is not null then
    select case when coalesce(cp.price, 0) > 0
                then greatest(cp.price - coalesce(cp.valor_cancelado, 0), 0) / cp.price
                else 1 end
      into v_fica
      from public.client_packages cp where cp.id = v_l.client_package_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
  end if;

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
    v_fator := coalesce(v_fica, 1);
  end if;

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
    v_fator := coalesce(v_fica, 1);
  end if;

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

  previsto   := v_valor;
  alvo       := round(v_valor * v_fracao, 2);
  base_fator := v_fator;
  base       := round(v_base * v_fator, 2);
end $function$;

notify pgrst, 'reload schema';
