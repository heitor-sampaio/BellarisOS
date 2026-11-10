-- D3 da 10ª simulação (2026-11-10): o extrato e o CSV da comissão mostravam o
-- PREÇO onde diziam "base" ("base sem a taxa da maquininha: R$ 420,00 · 40%"
-- ao lado de R$ 165,48; a venda do plano cancelado com Base 1.700 e Previsto
-- 35). A base que a conta usa existe só dentro de private.comissao_conta.
--
-- 1. private.comissao_conta_detalhe: o corpo de comissao_conta (o da produção
--    em 2026-11-10, sem mudar nada da conta) devolvendo também a base EFETIVA
--    e o que saiu dela — o desconto (pontos/voucher e o desconto comercial), a
--    taxa da maquininha e os insumos, em reais, e o fator do que ficou (o
--    pacote/plano cancelado, a venda devolvida em parte). base × regra = previsto.
-- 2. private.comissao_conta passa a ler dela (mesma assinatura: quem a chama
--    não muda) — a conta continua num lugar só.
-- 3. public.comissoes_extrato_com_base: o extrato de sempre
--    (comissoes_extrato_linhas, que fica sem chamador no app) com as colunas da
--    base. Só o servidor.

create or replace function private.comissao_conta_detalhe(p_linha uuid,
  out alvo numeric, out previsto numeric, out quitado boolean,
  out base numeric, out base_desconto numeric, out base_taxa numeric, out base_insumos numeric, out base_fator numeric)
returns record
language plpgsql
stable security definer
set search_path to ''
as $function$
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
  v_fator     numeric := 1;
begin
  alvo := 0; previsto := 0; quitado := false;
  base := null; base_desconto := 0; base_taxa := 0; base_insumos := 0; base_fator := 1;
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
    -- O fixo só os pontos e o voucher reduzem, na proporção (a base é o preço sem eles).
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

  -- A comissão de VENDA do pacote cancelado volta na proporção do que foi
  -- cancelado (F2b) — o previsto também, para não liberar sobre o que caiu.
  if v_l.origem = 'PACOTE_VENDA' and v_l.client_package_id is not null then
    select case when coalesce(cp.price, 0) > 0
                then greatest(cp.price - coalesce(cp.valor_cancelado, 0), 0) / cp.price
                else 1 end
      into v_fica
      from public.client_packages cp where cp.id = v_l.client_package_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
    v_fator := coalesce(v_fica, 1);
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
    v_fator := coalesce(v_fica, 1);
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
    v_fator := coalesce(v_fica, 1);
  end if;

  previsto   := v_valor;
  alvo       := round(v_valor * v_fracao, 2);
  base_fator := v_fator;
  base       := round(v_base * v_fator, 2);
end $function$;

revoke execute on function private.comissao_conta_detalhe(uuid) from public, anon, authenticated;

-- A conta de sempre, agora lida do detalhe: a mesma assinatura e o mesmo resultado.
create or replace function private.comissao_conta(p_linha uuid, out alvo numeric, out previsto numeric, out quitado boolean)
returns record
language sql
stable security definer
set search_path to ''
as $function$
  select d.alvo, d.previsto, d.quitado from private.comissao_conta_detalhe(p_linha) d
$function$;

create or replace function public.comissoes_extrato_com_base(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text,
  payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric,
  regra_tipo text, regra_valor numeric, pacote text, desconta_taxa boolean, desconta_insumos boolean, previsto numeric, base_com_pontos text, plano text,
  base numeric, base_desconto numeric, base_taxa numeric, base_insumos numeric, base_fator numeric)
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
         x.amount, x.status, x.payout_id, x.appointment_id, coalesce(a.scheduled_at, ps.sold_at, cp.purchased_at, tp.aceito_em),
         coalesce(cli.name, cps.name, ccp.name, ctp.name), coalesce(pr.name, ps.descricao, prod.name, sp.name, tp.name),
         case when l.pacote_responsavel then 'PACOTE_RESPONSAVEL'
              when tp.id is not null then 'PLANO_VENDA'
              else l.origem end,
         l.preco, l.regra_tipo::text, l.regra_valor,
         sp.name, l.desconta_taxa, l.desconta_insumos, x.previsto, l.base_com_pontos, tp.name,
         d.base, d.base_desconto, d.base_taxa, d.base_insumos, d.base_fator
    from itens x
    left join public.commission_lines l on l.id = x.line_id
    left join lateral private.comissao_conta_detalhe(l.id) d on l.id is not null
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
   order by x.released_at desc, x.id
$function$;

revoke execute on function public.comissoes_extrato_com_base(uuid, uuid[], timestamp with time zone, timestamp with time zone, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_extrato_com_base(uuid, uuid[], timestamp with time zone, timestamp with time zone, uuid) to service_role;

notify pgrst, 'reload schema';
