-- A34 da 8ª simulação (2026-11-06): a devolução em parte da venda de produto
-- nos números (migration 003801). Os corpos partem dos ATUAIS da produção.
-- - Vendas: a venda de produto vale o vendido menos o devolvido, e a
--   quantidade, as unidades que ficaram com a cliente.
-- - Lucro (insumos e produtos vendidos): o custo da venda menos o custo do que
--   voltou — o que voltou não foi custo de venda nenhuma.
-- - Perdas: o devolvido que NÃO voltou ao estoque é perda ("Venda estornada
--   (não voltou)", no dia da devolução); e o estorno inteiro que não voltou,
--   depois de uma devolução em parte, conta só o que ainda estava com ela.

create or replace function public.metrics_resultado(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid DEFAULT NULL::uuid)
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
    select v.branch_id, 0::numeric, v.custo - coalesce(v.custo_devolvido, 0)
      from public.product_sales v
      join scope s on s.id = v.branch_id
     where v.sold_at between p_from and p_to
       and v.estornada_em is null
       and (p_professional_id is null or v.sold_by = p_professional_id)
  )
  select x.branch_id, coalesce(sum(x.compra), 0), coalesce(sum(x.consumo), 0)
    from parcelas x
   group by grouping sets ((x.branch_id), ())
$function$;

create or replace function public.metrics_series_do_resultado(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text DEFAULT 'day'::text, p_professional_id uuid DEFAULT NULL::uuid)
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
    select date_trunc((select g from gran), v.sold_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, v.custo - coalesce(v.custo_devolvido, 0)
      from public.product_sales v
      join scope s on s.id = v.branch_id
     where v.sold_at between p_from and p_to
       and v.estornada_em is null
       and (p_professional_id is null or v.sold_by = p_professional_id)
  )
  select x.bucket, coalesce(sum(x.compra), 0), coalesce(sum(x.consumo), 0)
    from parcelas x
   group by x.bucket
   order by x.bucket
$function$;

create or replace function public.metrics_perdas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(motivo text, product_id uuid, produto text, unidade text, embalagem text, quantidade numeric, embalagens numeric, custo numeric, movimentos bigint)
 language sql
 stable
 set search_path to ''
as $function$
  with perdas as (
    select m.motivo_da_perda as motivo, m.product_id,
           abs(m.quantity) as qtd,
           abs(m.quantity) / public.fator_de_consumo(p) as emb,
           public.custo_do_movimento(m, p) as custo
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'LOSS'
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
    union all
    -- A venda estornada que não voltou: o que ainda estava com a cliente
    -- (sem o que a devolução em parte já levou).
    select 'VENDA_ESTORNADA', coalesce(i.product_id, v.product_id),
           (coalesce(i.quantity, v.quantity) - coalesce(i.devolvidas, 0)) * public.fator_de_consumo(p),
           (coalesce(i.quantity, v.quantity) - coalesce(i.devolvidas, 0))::numeric,
           coalesce(i.custo - coalesce(i.custo_devolvido, 0), v.custo)
      from public.product_sales v
      join public.branches b on b.id = v.branch_id and b.tenant_id = p_tenant
      left join public.product_sale_items i on i.sale_id = v.id
      left join public.products p on p.id = coalesce(i.product_id, v.product_id)
     where v.tenant_id = p_tenant
       and v.estornada_em is not null and v.produto_voltou = false
       and coalesce(i.quantity, v.quantity) - coalesce(i.devolvidas, 0) > 0
       and (p_branch_ids is null or v.branch_id = any (p_branch_ids))
       and v.estornada_em between p_from and p_to
    union all
    -- A devolução em parte que não voltou ao estoque (A34 da 8ª).
    select 'VENDA_ESTORNADA', i.product_id,
           r.quantidade * public.fator_de_consumo(p),
           r.quantidade::numeric,
           r.custo
      from public.product_sale_returns r
      join public.product_sales v on v.id = r.sale_id
      join public.branches b on b.id = v.branch_id and b.tenant_id = p_tenant
      join public.product_sale_items i on i.id = r.item_id
      left join public.products p on p.id = i.product_id
     where r.tenant_id = p_tenant and not r.voltou
       and (p_branch_ids is null or v.branch_id = any (p_branch_ids))
       and r.created_at between p_from and p_to
  )
  select x.motivo,
         x.product_id,
         case when grouping(x.product_id) = 0 then max(p.name) end,
         case when grouping(x.product_id) = 0 then max(case when public.tem_unidade_de_consumo(p) then p.consumption_unit else p.unit end) end,
         case when grouping(x.product_id) = 0 then max(p.unit) end,
         case when grouping(x.product_id) = 0 then sum(x.qtd) end,
         case when grouping(x.product_id) = 0 then round(sum(x.emb), 4) end,
         round(coalesce(sum(x.custo), 0), 2),
         count(*)
    from perdas x
    left join public.products p on p.id = x.product_id
   group by grouping sets ((x.motivo, x.product_id), (x.motivo), ())
$function$;

create or replace function public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid DEFAULT NULL::uuid)
 returns table(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric)
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
         a.price - coalesce(t.sale_discount, 0)
    from public.appointments a
    join scope s on s.id = a.branch_id
    join public.procedures pr on pr.id = a.procedure_id
    left join public.clients c on c.id = a.client_id
    left join public.users u on u.id = a.professional_id
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

  -- O pacote cancelado vale o que foi usado (F2b, 2026-11-01); cancelado
  -- sem nenhuma sessão feita, sai. O pacote trazido de fora (F35) não é venda.
  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price - coalesce(cp.valor_cancelado, 0)
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
   where cp.purchased_at between p_from and p_to
     and not cp.de_fora
     and (cp.cancelado_em is null or coalesce(cp.price, 0) - coalesce(cp.valor_cancelado, 0) > 0)
     and (p_professional_id is null or cp.sold_by = p_professional_id)

  -- O pré-pago vale sem as unidades canceladas (procedimento_cancelar_unidade:
  -- "a venda passa a valer menos"); todas canceladas, sai.
  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price - coalesce(x.cancelado, 0)
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
    left join lateral (
      select sum(un.preco) cancelado from public.procedure_sale_units un
       where un.sale_id = v.id and un.status = 'CANCELADA'
    ) x on true
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to
     and (coalesce(x.cancelado, 0) = 0 or v.price - x.cancelado > 0)
     and (p_professional_id is null or v.sold_by = p_professional_id)

  -- O plano é de quem VENDEU (D14 da 8ª); sem "Quem vendeu", da dona do plano.
  union all
  select tp.id, 'PLANO', tp.aceito_em, coalesce(nullif(btrim(tp.name), ''), 'Plano de tratamento'),
         (select count(*)::integer from public.treatment_plan_sessions x where x.plan_id = tp.id),
         tp.client_id, c.name, u.name, tp.branch_id,
         coalesce((select sum(x.price)
                     from public.treatment_plan_session_procedures x
                     join public.treatment_plan_sessions ss on ss.id = x.session_id
                    where ss.plan_id = tp.id), 0)
    from public.treatment_plans tp
    join scope s on s.id = tp.branch_id
    left join public.clients c on c.id = tp.client_id
    left join public.users u on u.id = coalesce(tp.vendido_por, tp.professional_id)
   where tp.status in ('ACCEPTED', 'COMPLETED')
     and tp.aceito_em between p_from and p_to
     and (p_professional_id is null or coalesce(tp.vendido_por, tp.professional_id) = p_professional_id)

  -- A venda de produto (D4, 2026-10-30): na data da venda, pelo vendido, e
  -- "quem vendeu" na coluna Profissional (o recorte do "só os meus"). A
  -- ESTORNADA não é venda (H2, 2026-11-01). O kit (ven-04) diz os produtos.
  -- A devolução em parte (A34 da 8ª) tira do valor e das unidades o que voltou.
  union all
  select ps.id, 'PRODUTO', ps.sold_at, coalesce(ps.descricao, p.name), ps.quantity - coalesce(ps.unidades_devolvidas, 0),
         ps.client_id, c.name, u.name, ps.branch_id, ps.price - coalesce(ps.valor_devolvido, 0)
    from public.product_sales ps
    join scope s on s.id = ps.branch_id
    join public.products p on p.id = ps.product_id
    left join public.clients c on c.id = ps.client_id
    left join public.users u on u.id = ps.sold_by
   where ps.tenant_id = p_tenant
     and ps.estornada_em is null
     and ps.sold_at between p_from and p_to
     and (p_professional_id is null or ps.sold_by = p_professional_id)
$function$;

notify pgrst, 'reload schema';
