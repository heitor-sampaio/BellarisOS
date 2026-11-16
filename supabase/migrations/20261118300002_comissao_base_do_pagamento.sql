-- D5 da 18ª simulação (2026-11-16; princípio 3: o que a tela mostra é o que
-- vale na conta). O Preenchimento da Beatriz (R$ 1.500, 30%) foi pago com
-- R$ 88,44 de desconto rateado (R$ 1.411,56 no crédito 3x: +R$ 423,47),
-- estornado (−R$ 423,47) e recebido de novo cheio no dinheiro (+R$ 450). As
-- três linhas do extrato diziam "base cheia R$ 1.500,00 · 30%": a base vinha
-- de `private.comissao_conta_detalhe(l.id)`, a conta da LINHA de hoje (o
-- pagamento vivo), e não a do pagamento de cada lançamento.
--
-- Agora, no atendimento avulso, o lançamento ligado a um pagamento
-- (`commissions.transaction_id`: a liberação e o estorno dele) diz a base
-- daquele pagamento — o desconto, a taxa (se a rede desconta) e os insumos
-- (se desconta), a mesma régua de `comissao_conta_detalhe` com aquele
-- pagamento como o pago (`private.comissao_base_do_pagamento`). O resto
-- (pacote, plano, venda; o acerto sem pagamento) segue a conta da linha.
--
-- `comissoes_extrato_com_regra` é a de 20261110005603 com o `transaction_id`
-- nos itens e a base do pagamento na frente; as colunas não mudam.

create or replace function private.comissao_base_do_pagamento(
  p_linha uuid, p_transacao uuid,
  out base numeric, out base_desconto numeric, out base_taxa numeric, out base_insumos numeric)
 returns record
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  v_l        public.commission_lines%rowtype;
  v_f        public.financial_transactions%rowtype;
  v_desconto numeric := 0;
  v_dvenda   numeric := 0;
  v_taxa     numeric := 0;
  v_base     numeric;
begin
  base := null; base_desconto := 0; base_taxa := 0; base_insumos := 0;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.origem <> 'AVULSO' or v_l.appointment_id is null or p_transacao is null then
    return;
  end if;
  select * into v_f from public.financial_transactions f
   where f.id = p_transacao and f.appointment_id = v_l.appointment_id and f.type = 'INCOME';
  if not found then
    return;
  end if;

  -- Os pontos e o voucher só reduzem a base no "sobre o pago" (como na conta da linha).
  if v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO' then
    v_desconto := coalesce(v_f.loyalty_discount, 0);
  end if;
  v_dvenda := coalesce(v_f.sale_discount, 0);
  v_taxa := private.comissao_taxa_pct(v_l.tenant_id, v_f.payment_method::text,
              coalesce(v_f.cartao_vezes, v_f.parcela_total, 1), v_f.cartao_bandeira, v_f.maquininha_id);

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
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
  end if;
  base := round(v_base, 2);
end $function$;

revoke execute on function private.comissao_base_do_pagamento(uuid, uuid) from public, anon, authenticated;

create or replace function public.comissoes_extrato_com_regra(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
 returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric, pacote text, desconta_taxa boolean, desconta_insumos boolean, previsto numeric, base_com_pontos text, plano text, base numeric, base_desconto numeric, base_taxa numeric, base_insumos numeric, base_fator numeric, regra_de text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with itens as (
    select c.id, c.professional_id, c.branch_id, c.released_at, c.kind, c.motivo, c.amount,
           c.status::text as status, c.payout_id, c.appointment_id, c.line_id, null::numeric as previsto,
           c.transaction_id
      from public.commissions c
      join public.branches b on b.id = c.branch_id
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
       and (p_profissional is null or c.professional_id = p_profissional)
       and (c.released_at between p_inicio and p_fim
            or (c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim))
    union all
    select g.line_id, g.professional_id, g.branch_id, g.desde, 'AGUARDANDO', 'Aguardando o pagamento integral', 0::numeric,
           'AGUARDANDO', null::uuid, l.appointment_id, g.line_id, g.previsto, null::uuid
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
         -- D5 da 18ª: o lançamento de um pagamento diz a base daquele pagamento.
         case when pg.base is not null then pg.base
              when d.base is null then null
              when f.fator = d.base_fator then d.base
              else round(greatest(l.preco - d.base_desconto - d.base_taxa - d.base_insumos, 0) * f.fator, 2) end,
         case when pg.base is not null then pg.base_desconto else d.base_desconto end,
         case when pg.base is not null then pg.base_taxa else d.base_taxa end,
         case when pg.base is not null then pg.base_insumos else d.base_insumos end,
         case when pg.base is not null then 1::numeric when d.base is null then d.base_fator else f.fator end,
         l.regra_de
    from itens x
    left join public.commission_lines l on l.id = x.line_id
    left join lateral private.comissao_conta_detalhe(l.id) d on l.id is not null
    left join lateral private.comissao_base_do_pagamento(l.id, x.transaction_id) pg
      on l.id is not null and x.transaction_id is not null and x.kind <> 'AGUARDANDO' and l.origem = 'AVULSO'
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
