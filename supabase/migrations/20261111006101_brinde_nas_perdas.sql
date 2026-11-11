-- A40 da 12ª simulação (2026-11-11; princípio 3): o brinde da fidelidade
-- entregue (a "Máscara cortesia" da Helena) sai do estoque como um ajuste
-- negativo (`entregar_voucher_produto`, MANUAL_ADJUSTMENT com a referência
-- `voucher:<id>`) e caía em "Perdas no período" como "Inventário" — a contagem
-- que achou menos. Agora é o motivo "Brinde da fidelidade" (`BRINDE`), pelo
-- custo do lote de onde saiu (o gatilho do lote grava no ajuste negativo o
-- custo dos lotes que o FEFO tirou; `custo_do_movimento`). Como toda perda, é
-- métrica: fora do giro e do lucro (D-7). O brinde sem produto (A7, texto livre)
-- não tem movimento, e não aparece.
--
-- Parte do corpo ATUAL de produção (`pg_get_functiondef`), com o ramo do
-- inventário sem as entregas de voucher e um ramo novo para elas.

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
    -- D5 da 10ª: o ajuste de inventário que achou MENOS é perda ("Inventário").
    -- D5 da 11ª: o desfeito não é, nem o movimento que desfaz um ajuste.
    -- A40 da 12ª: a entrega do brinde (voucher) não é inventário — vai abaixo.
    select 'INVENTARIO', m.product_id,
           abs(m.quantity),
           abs(m.quantity) / public.fator_de_consumo(p),
           public.custo_do_movimento(m, p)
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'MANUAL_ADJUSTMENT' and m.quantity < 0
       and coalesce(m.reference, '') not like 'voucher:%'
       and m.desfeita_em is null
       and not exists (select 1 from public.stock_movements o where o.desfeita_pelo = m.id)
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
    union all
    -- A40 da 12ª: o brinde da fidelidade entregue, pelo custo do lote.
    select 'BRINDE', m.product_id,
           abs(m.quantity),
           abs(m.quantity) / public.fator_de_consumo(p),
           public.custo_do_movimento(m, p)
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'MANUAL_ADJUSTMENT' and m.quantity < 0
       and m.reference like 'voucher:%'
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

notify pgrst, 'reload schema';
