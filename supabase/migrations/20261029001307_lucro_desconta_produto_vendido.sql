-- D4 (2026-10-30): o custo do PRODUTO VENDIDO entra no lucro como o insumo
-- consumido ("deve poder entrar nas métricas de custo/lucro de forma coerente
-- com a regra do insumo").
--
-- A regra do lucro (decisão do Heitor, 2026-10-29) desconta o estoque que SAIU
-- para gerar a receita — o insumo consumido —, e deixa a compra de estoque no
-- caixa (senão o produto seria descontado duas vezes). O produto vendido é o
-- mesmo caso: a receita da venda entra pela regra única de receita, e o custo
-- dele (`product_sales.custo`, o custo dos lotes que o FEFO tirou, retratado
-- na venda) sai na MESMA parcela do lucro, na data da venda. Por isso a
-- parcela `consumo_de_insumo` de metrics_resultado e de
-- metrics_series_do_resultado passa a somar os dois — o nome da coluna fica
-- (as telas e o Copilot a leem), e o DRE diz "Insumos e produtos vendidos".
--
-- Com um profissional ("só os meus"), a venda é de quem vendeu (sold_by) —
-- o mesmo recorte de metrics_vendas.
-- A perda (D-7) NÃO entra: não gerou receita (decisão para o Heitor).

create or replace function public.metrics_resultado(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(branch_id uuid, compra_de_estoque numeric, consumo_de_insumo numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  parcelas as (
    select t.branch_id, t.amount as compra, 0::numeric as consumo
      from public.financial_transactions t
      join scope s on s.id = t.branch_id
     where t.type = 'EXPENSE' and t.is_paid
       and coalesce(t.notes, '')    <> 'Estornada'
       and coalesce(t.category, '') <> 'Estorno'
       and lower(btrim(coalesce(t.category, ''))) in ('compra de estoque', 'estoque')
       and coalesce(t.paid_at, t.created_at) between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = t.appointment_id and a.professional_id = p_professional_id))
    union all
    select m.branch_id, 0::numeric, public.custo_do_movimento(m, p)
      from public.stock_movements m
      join scope s on s.id = m.branch_id
      left join public.products p on p.id = m.product_id
     where m.type = 'PROCEDURE_USAGE'
       and m.created_at between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = m.appointment_id and a.professional_id = p_professional_id))
    union all
    -- O custo do produto vendido (D4): o retrato da venda, na data dela.
    select v.branch_id, 0::numeric, v.custo
      from public.product_sales v
      join scope s on s.id = v.branch_id
     where v.sold_at between p_from and p_to
       and (p_professional_id is null or v.sold_by = p_professional_id)
  )
  select x.branch_id, coalesce(sum(x.compra), 0), coalesce(sum(x.consumo), 0)
    from parcelas x
   group by grouping sets ((x.branch_id), ())
$function$;

create or replace function public.metrics_series_do_resultado(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null::uuid)
 returns table(bucket timestamp with time zone, compra_de_estoque numeric, consumo_de_insumo numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  gran as (
    select case when p_granularity in ('hour', 'day', 'week', 'month') then p_granularity else 'day' end as g
  ),
  parcelas as (
    select date_trunc((select g from gran), coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as bucket,
           t.amount as compra, 0::numeric as consumo
      from public.financial_transactions t
      join scope s on s.id = t.branch_id
     where t.type = 'EXPENSE' and t.is_paid
       and coalesce(t.notes, '')    <> 'Estornada'
       and coalesce(t.category, '') <> 'Estorno'
       and lower(btrim(coalesce(t.category, ''))) in ('compra de estoque', 'estoque')
       and coalesce(t.paid_at, t.created_at) between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = t.appointment_id and a.professional_id = p_professional_id))
    union all
    select date_trunc((select g from gran), m.created_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, public.custo_do_movimento(m, p)
      from public.stock_movements m
      join scope s on s.id = m.branch_id
      left join public.products p on p.id = m.product_id
     where m.type = 'PROCEDURE_USAGE'
       and m.created_at between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = m.appointment_id and a.professional_id = p_professional_id))
    union all
    -- O custo do produto vendido (D4), na fatia da venda.
    select date_trunc((select g from gran), v.sold_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, v.custo
      from public.product_sales v
      join scope s on s.id = v.branch_id
     where v.sold_at between p_from and p_to
       and (p_professional_id is null or v.sold_by = p_professional_id)
  )
  select x.bucket, coalesce(sum(x.compra), 0), coalesce(sum(x.consumo), 0)
    from parcelas x
   group by x.bucket
   order by x.bucket
$function$;

notify pgrst, 'reload schema';
