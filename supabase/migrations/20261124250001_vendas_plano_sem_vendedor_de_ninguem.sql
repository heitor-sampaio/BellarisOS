-- O plano sem "Quem vendeu" não é venda de ninguém (com-06 — o Heitor, revisão
-- de 02–03/11: "Campo vazio não gera comissão para ninguém"; o "Quem vendeu"
-- nasce sempre vazio, r2-ven-12). Achado da auditoria das regras (18/11).
--
-- Desde a D14 da 8ª (migration 20261106003404) o Relatório de Vendas punha o
-- plano sem vendedor em nome da responsável pelo plano
-- (`coalesce(tp.vendido_por, tp.professional_id)`), na coluna "Profissional" e
-- no "só os meus" (p_professional_id): a venda ia a quem ninguém escolheu. Agora
-- é só `treatment_plans.vendido_por` — como o pacote, o pré-pago e o produto
-- (`sold_by` nulo = de ninguém). A venda segue no total.
--
-- Partindo do corpo ATUAL da produção (20261121000001); só o trecho do PLANO
-- mudou. metrics_vendas_pagina e metrics_vendas_resumo leem esta função.

create or replace function public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
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
      select sum(f.sale_discount) as sale_discount from public.financial_transactions f
       where f.appointment_id = a.id and f.type::text = 'INCOME' and f.estorno_de is null
         and f.created_at = (select g.created_at from public.financial_transactions g
                              where g.appointment_id = a.id and g.type::text = 'INCOME' and g.estorno_de is null
                              order by (coalesce(g.notes, '') = 'Estornada'), g.created_at desc, g.id
                              limit 1)
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
    left join public.users u on u.id = tp.vendido_por
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
     and (p_professional_id is null or tp.vendido_por = p_professional_id)

  union all
  select ps.id, 'PRODUTO', ps.sold_at, coalesce(ps.descricao, p.name), ps.quantity - coalesce(ps.unidades_devolvidas, 0),
         ps.client_id, c.name, u.name, ps.branch_id, ps.price - coalesce(ps.valor_devolvido, 0),
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

revoke execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_vendas(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
