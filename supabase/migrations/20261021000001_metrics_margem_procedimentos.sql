-- A margem por procedimento, contada no banco (2026-10-21).
--
-- A simulação de um dia de clínica (2026-10-20) viu a Toxina com −3858% e o
-- Peeling com −71% no dashboard da rede: a página multiplicava a quantidade do
-- insumo (40 U, 5 ml) pelo preço da EMBALAGEM inteira (products.cost_price, o
-- frasco), e fazia a conta ela mesma — fora de lib/metrics (CLAUDE.md §13.1).
--
-- O custo do insumo é o da unidade de CONSUMO: o preço da embalagem ÷ o que
-- ela rende (units_per_package), quando o produto tem unidade de consumo; senão
-- o preço da unidade. É o custo ATUAL do produto (o catálogo, não o histórico;
-- o giro de estoque usa o custo do movimento). Sem preço no produto, vale o
-- custo gravado no insumo do procedimento. Mais mão de obra e outros custos.

create or replace function public.metrics_margem_procedimentos(p_tenant uuid, p_limit int default 5)
 returns table(procedure_id uuid, procedure_name text, price numeric, cost numeric, margin_pct numeric)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with custos as (
    select pr.id, pr.name, round(coalesce(pr.price, 0), 2) as price,
           round(coalesce(pr.labor_cost, 0) + coalesce(pr.other_costs, 0)
             + coalesce((
                 select sum(pp.quantity * coalesce(
                   nullif(case when p.consumption_unit is not null and coalesce(p.units_per_package, 0) > 0
                               then p.cost_price / p.units_per_package
                               else p.cost_price end, 0),
                   pp.unit_cost, 0))
                   from public.procedure_products pp
                   join public.products p on p.id = pp.product_id
                  where pp.procedure_id = pr.id
               ), 0), 2) as cost
      from public.procedures pr
     where pr.tenant_id = p_tenant and coalesce(pr.is_active, true) and coalesce(pr.price, 0) > 0
  )
  select id, name, price, cost, round((price - cost) / price * 100, 2)
    from custos
   order by (price - cost) / price desc, name
   limit greatest(1, least(coalesce(p_limit, 5), 100))
$function$;

revoke execute on function public.metrics_margem_procedimentos(uuid, int) from public, anon, authenticated;
grant execute on function public.metrics_margem_procedimentos(uuid, int) to service_role;

notify pgrst, 'reload schema';
