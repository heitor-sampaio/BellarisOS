-- RL1 (a revisão do Heitor, 2026-11-13: "rl1 ok"): Relatórios → Vendas lista
-- as COMANDAS do PDV — cada venda, do que for: atendimento avulso, pacote,
-- pré-pago, plano, produto e CRÉDITO na clínica —, com o número da comanda de
-- cada linha, o filtro por tipo e o CSV.
--
-- Do corpo de produção (pg_get_functiondef, 2026-11-14), com:
-- 1. a coluna `comanda` (o número da comanda da venda; nulo na venda de antes
--    do PDV): a do atendimento, do plano, do pacote, do pré-pago, do produto
--    (avulsa, ou o item dentro da comanda do atendimento) e do crédito;
-- 2. o tipo CREDITO: o crédito na clínica vendido (`creditos_vendidos`), na
--    data da venda, pelo valor pago menos o devolvido. Sem profissional: no
--    "só os meus" ele não entra (não é venda de ninguém);
-- 3. o resumo: o total GERAL (o "Total vendido") NÃO soma o crédito — o que se
--    paga com ele é que é a venda (o atendimento, o pacote…); somar os dois
--    contaria o mesmo dinheiro duas vezes. O crédito tem a linha dele no
--    resumo por tipo, e a tela diz isso (princípio 3).
--
-- O tipo de retorno muda (a coluna nova): as três saem e voltam. Recebem a
-- rede por parâmetro: só service_role (os grants de antes).

drop function if exists public.metrics_vendas_resumo(uuid, uuid[], timestamptz, timestamptz, uuid);
drop function if exists public.metrics_vendas_pagina(uuid, uuid[], timestamptz, timestamptz, text, integer, integer, uuid);
drop function if exists public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz, uuid);

create function public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric, comanda integer)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  )
  select a.id, 'PROCEDIMENTO', a.aconteceu_em, pr.name, 1,
         a.client_id, c.name, u.name, a.branch_id,
         a.price - coalesce(t.sale_discount, 0), k.numero
    from public.appointments a
    join scope s on s.id = a.branch_id
    join public.procedures pr on pr.id = a.procedure_id
    left join public.clients c on c.id = a.client_id
    left join public.users u on u.id = a.professional_id
    left join public.comandas k on k.appointment_id = a.id
    left join lateral (
      select f.sale_discount from public.financial_transactions f
       where f.appointment_id = a.id
       order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
       limit 1
    ) t on true
   where a.status = 'COMPLETED'
     and a.aconteceu_em between p_from and p_to
     and a.price > 0
     and a.treatment_plan_id is null
     and not exists (select 1 from public.package_sessions x where x.appointment_id = a.id)
     and not exists (select 1 from public.procedure_sale_units x where x.appointment_id = a.id)
     and (p_professional_id is null or a.professional_id = p_professional_id)

  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price - coalesce(cp.valor_cancelado, 0), k.numero
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
    left join public.comandas k on k.client_package_id = cp.id
   where cp.purchased_at between p_from and p_to
     and not cp.de_fora
     and (cp.cancelado_em is null or coalesce(cp.price, 0) - coalesce(cp.valor_cancelado, 0) > 0)
     and (p_professional_id is null or cp.sold_by = p_professional_id)

  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price - coalesce(x.cancelado, 0), k.numero
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
    left join public.comandas k on k.procedure_sale_id = v.id
    left join lateral (
      select sum(un.preco) cancelado from public.procedure_sale_units un
       where un.sale_id = v.id and un.status = 'CANCELADA'
    ) x on true
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to
     and (coalesce(x.cancelado, 0) = 0 or v.price - x.cancelado > 0)
     and (p_professional_id is null or v.sold_by = p_professional_id)

  union all
  select tp.id, 'PLANO', rec.em, coalesce(nullif(btrim(tp.name), ''), 'Plano de tratamento'),
         (select count(*)::integer from public.treatment_plan_sessions x where x.plan_id = tp.id),
         tp.client_id, c.name, u.name, tp.branch_id,
         soma.valor - coalesce(tp.valor_cancelado, 0), k.numero
    from public.treatment_plans tp
    join scope s on s.id = tp.branch_id
    left join public.clients c on c.id = tp.client_id
    left join public.users u on u.id = coalesce(tp.vendido_por, tp.professional_id)
    left join public.comandas k on k.treatment_plan_id = tp.id
    cross join lateral (
      select coalesce(sum(x.price), 0) valor
        from public.treatment_plan_session_procedures x
        join public.treatment_plan_sessions ss on ss.id = x.session_id
       where ss.plan_id = tp.id
    ) soma
    cross join lateral (
      select min(f.created_at) em
        from public.financial_transactions f
       where f.treatment_plan_id = tp.id and f.type::text = 'INCOME' and f.estorno_de is null
    ) rec
   where (tp.status in ('ACCEPTED', 'COMPLETED')
          or (tp.cancelado_em is not null and soma.valor - coalesce(tp.valor_cancelado, 0) > 0))
     and rec.em between p_from and p_to
     and (p_professional_id is null or coalesce(tp.vendido_por, tp.professional_id) = p_professional_id)

  union all
  select ps.id, 'PRODUTO', ps.sold_at, coalesce(ps.descricao, p.name), ps.quantity - coalesce(ps.unidades_devolvidas, 0),
         ps.client_id, c.name, u.name, ps.branch_id, ps.price - coalesce(ps.valor_devolvido, 0),
         -- A venda avulsa tem a comanda dela; o produto vendido dentro do
         -- atendimento é um item da comanda do atendimento.
         coalesce(k.numero, (select k2.numero from public.comanda_itens i
                               join public.comandas k2 on k2.id = i.comanda_id
                              where i.product_sale_id = ps.id
                              order by k2.numero limit 1))
    from public.product_sales ps
    join scope s on s.id = ps.branch_id
    join public.products p on p.id = ps.product_id
    left join public.clients c on c.id = ps.client_id
    left join public.users u on u.id = ps.sold_by
    left join public.comandas k on k.product_sale_id = ps.id
   where ps.tenant_id = p_tenant
     and ps.estornada_em is null
     and ps.sold_at between p_from and p_to
     and (p_professional_id is null or ps.sold_by = p_professional_id)

  union all
  -- RL1: o crédito na clínica vendido. Fica FORA do total geral (o resumo).
  select cv.id, 'CREDITO', cv.created_at, 'Crédito na clínica', 1,
         cv.client_id, c.name, null::text, cv.branch_id,
         cv.valor - coalesce(cv.valor_devolvido, 0), k.numero
    from public.creditos_vendidos cv
    join scope s on s.id = cv.branch_id
    left join public.clients c on c.id = cv.client_id
    left join public.comandas k on k.credito_vendido_id = cv.id
   where cv.tenant_id = p_tenant
     and cv.created_at between p_from and p_to
     and (cv.estornado_em is null or cv.valor - coalesce(cv.valor_devolvido, 0) > 0)
     and p_professional_id is null
$function$;

create function public.metrics_vendas_pagina(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_tipo text default null::text, p_limite integer default 50, p_offset integer default 0, p_professional_id uuid default null::uuid)
 returns table(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric, comanda integer)
 language sql
 stable
 set search_path to ''
as $function$
  select v.*
    from public.metrics_vendas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) v
   where p_tipo is null or v.tipo = p_tipo
   order by v.data desc, v.id
   limit greatest(1, least(p_limite, 1000)) offset greatest(0, p_offset)
$function$;

-- Por tipo (o crédito também), e o geral (tipo nulo) SEM o crédito: é o
-- "Total vendido". `linhas` = quantas linhas a lista tem (a paginação).
create function public.metrics_vendas_resumo(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(tipo text, quantidade bigint, total numeric, linhas bigint)
 language sql
 stable
 set search_path to ''
as $function$
  with v as materialized (
    select x.tipo, x.valor
      from public.metrics_vendas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) x
  )
  select v.tipo, count(*), coalesce(sum(v.valor), 0), count(*)
    from v
   group by v.tipo
  union all
  select null, count(*) filter (where v.tipo <> 'CREDITO'),
         coalesce(sum(v.valor) filter (where v.tipo <> 'CREDITO'), 0), count(*)
    from v
$function$;

revoke execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_vendas_pagina(uuid, uuid[], timestamptz, timestamptz, text, integer, integer, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_vendas_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_vendas_pagina(uuid, uuid[], timestamptz, timestamptz, text, integer, integer, uuid) to service_role;
grant execute on function public.metrics_vendas_resumo(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
