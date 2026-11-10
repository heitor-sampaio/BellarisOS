-- F54 — D7 da 11ª simulação (2026-11-10): cada lançamento do extrato da
-- comissão com a base DA HORA DELE.
--
-- Depois do cancelamento do pacote (R$ 1.100, ficaram R$ 110), a liberação de
-- R$ 33,00 — lançada com o pacote inteiro — passava a dizer "base cheia
-- R$ 110,00 (R$ 1.100,00, na proporção do que ficou (10%)) · 3%", ao lado do
-- acerto de −R$ 29,70. `comissoes_extrato_com_base` aplicava a TODOS os
-- lançamentos da linha o fator de HOJE (`comissao_conta_detalhe`).
--
-- O fator (a proporção do que ficou) só muda com o cancelamento do pacote, o
-- do plano (os dois uma vez, em `cancelado_em`) e a devolução da venda de
-- produto (cada uma em `product_sale_returns.created_at`). Antes disso, era 1.
-- `private.comissao_fator_em` diz o fator de uma linha num instante; o extrato
-- o usa em cada lançamento, sobre a base de antes do fator (o preço menos o
-- desconto, a taxa e os insumos que o detalhe devolve). A conta não muda: o
-- valor de cada lançamento é o que foi lançado.
--
-- Parte do corpo ATUAL da produção de comissoes_extrato_com_base
-- (20261110004901); só a base e o fator mudam.

create or replace function private.comissao_fator_em(p_linha uuid, p_quando timestamptz)
returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_l      public.commission_lines%rowtype;
  v_fator  numeric := 1;
  v_cheio  numeric;
  v_dev    numeric;
begin
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found then
    return 1;
  end if;

  if v_l.origem = 'PACOTE_VENDA' and v_l.client_package_id is not null then
    select case when cp.cancelado_em is null or p_quando < cp.cancelado_em then 1
                when coalesce(cp.price, 0) > 0 then greatest(cp.price - coalesce(cp.valor_cancelado, 0), 0) / cp.price
                else 1 end
      into v_fator
      from public.client_packages cp where cp.id = v_l.client_package_id;

  elsif v_l.origem = 'PLANO' and v_l.appointment_id is null then
    select coalesce(sum(p.price), 0) into v_cheio
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = v_l.treatment_plan_id;
    select case when tp.cancelado_em is null or p_quando < tp.cancelado_em then 1
                when v_cheio > 0 then greatest(v_cheio - coalesce(tp.valor_cancelado, 0), 0) / v_cheio
                else 1 end
      into v_fator
      from public.treatment_plans tp where tp.id = v_l.treatment_plan_id;

  elsif v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null then
    if coalesce(v_l.item, 0) = 0 then
      select coalesce(sum(r.valor), 0) into v_dev
        from public.product_sale_returns r
       where r.sale_id = v_l.product_sale_id and r.created_at <= p_quando;
      select case when coalesce(ps.price, 0) > 0 then greatest(ps.price - v_dev, 0) / ps.price else 1 end
        into v_fator
        from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select coalesce(sum(r.valor), 0) into v_dev
        from public.product_sale_returns r
        join public.product_sale_items i on i.id = r.item_id
       where r.sale_id = v_l.product_sale_id and i.sort_order = v_l.item and r.created_at <= p_quando;
      v_fator := case when coalesce(v_l.preco, 0) > 0 then greatest(v_l.preco - v_dev, 0) / v_l.preco else 1 end;
    end if;
  end if;

  return coalesce(v_fator, 1);
end
$function$;

revoke execute on function private.comissao_fator_em(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.comissoes_extrato_com_base(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
 returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric, pacote text, desconta_taxa boolean, desconta_insumos boolean, previsto numeric, base_com_pontos text, plano text, base numeric, base_desconto numeric, base_taxa numeric, base_insumos numeric, base_fator numeric)
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
         -- D7 da 11ª: a base da HORA do lançamento — a de antes do fator, no
         -- fator daquele instante (o que aguarda é o de agora).
         case when d.base is null then null
              when f.fator = d.base_fator then d.base
              else round(greatest(l.preco - d.base_desconto - d.base_taxa - d.base_insumos, 0) * f.fator, 2) end,
         d.base_desconto, d.base_taxa, d.base_insumos,
         case when d.base is null then d.base_fator else f.fator end
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
   order by x.released_at desc, x.id
$function$;

notify pgrst, 'reload schema';
