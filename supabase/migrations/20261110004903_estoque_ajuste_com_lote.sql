-- D5 da 10ª simulação (2026-11-10): o ajuste de inventário não fechava com os
-- lotes nem com os relatórios. (a) O POSITIVO (+1 galão de Gel achado) não
-- entrava em lote nenhum — saldo 18,1, lotes 17,1 —, e a unidade a mais
-- ficava sem validade, fora de "Validades próximas". (b) O NEGATIVO (2 potes
-- de Máscara a menos) gravava custo nulo: o valor em estoque caía sem nenhuma
-- linha dizer para onde, e "Perdas no período" não o contava — enquanto o DRE
-- dizia que "a perda e o ajuste de estoque … são métrica, em Relatórios →
-- Estoque". Decidido pelos princípios (o relatório da 10ª):
--
-- 1. public.estoque_ajuste_com_lote: o ajuste de sempre (estoque_ajuste_em, a
--    contagem exata na unidade digitada) e, quando a contagem é MAIOR que o
--    saldo, a diferença entra num lote — o escolhido (p_lote), ou um novo "sem
--    número", com a validade opcional —, ao custo dele (o do lote; no novo, o
--    último custo). O negativo sai pelo FEFO no gatilho do lote, que grava o
--    custo dos lotes de onde saiu (20261110004902). estoque_ajuste_em fica
--    (sem chamador no app).
-- 2. metrics_perdas: o ajuste NEGATIVO entra em "Perdas no período" com o
--    motivo INVENTARIO ("Inventário"), ao custo do movimento — também os de
--    antes (sem custo gravado, valem o último custo, custo_do_movimento).

create or replace function public.estoque_ajuste_com_lote(
  p_produto uuid, p_unidade uuid, p_contagem numeric, p_em_consumo boolean, p_motivo text, p_autor text,
  p_lote uuid, p_lote_numero text, p_lote_validade timestamp with time zone)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p          public.products%rowtype;
  v_upp        numeric;
  v_saldo      numeric;
  v_rendimento numeric;
  v_rend_antes numeric;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_delta      numeric;   -- na unidade do movimento (consumo, com unidade de consumo)
  v_delta_emb  numeric;   -- em embalagens (o lote)
  v_custo      numeric;
  v_mov        uuid;
  v_lote       uuid;
begin
  if p_contagem is null or p_contagem < 0 then
    raise exception 'Novo estoque não pode ser negativo.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Motivo do ajuste é obrigatório.' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = p_produto;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = v_p.tenant_id) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  v_upp := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;

  insert into public.branch_product_stock (product_id, branch_id, current_stock, min_stock)
  values (p_produto, p_unidade, 0, 0)
  on conflict (product_id, branch_id) do nothing;

  select s.current_stock, s.current_rendimento into v_saldo, v_rendimento
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = p_unidade
   for update;

  if v_upp is not null then
    v_rend_antes := coalesce(v_rendimento, coalesce(v_saldo, 0) * v_upp);
    v_novo_rend  := case when coalesce(p_em_consumo, false) then p_contagem else p_contagem * v_upp end;
    v_novas      := ceil(round(v_novo_rend / v_upp, 6));
    v_delta      := v_novo_rend - v_rend_antes;
    v_delta_emb  := v_delta / v_upp;
  else
    v_novas      := p_contagem;
    v_delta      := p_contagem - coalesce(v_saldo, 0);
    v_delta_emb  := v_delta;
  end if;

  -- O lote escolhido é desta unidade e deste produto.
  if v_delta > 0 and p_lote is not null then
    select b.id into v_lote
      from public.product_batches b
     where b.id = p_lote and b.product_id = p_produto and b.branch_id = p_unidade
     for update;
    if v_lote is null then
      raise exception 'Lote não encontrado nesta unidade.' using errcode = 'P0001';
    end if;
    v_custo := public.custo_do_lote(v_lote);
  end if;
  if v_delta > 0 then
    v_custo := coalesce(v_custo, public.custo_de_consumo(v_p));
  end if;

  insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by)
  values (p_unidade, p_produto, 'MANUAL_ADJUSTMENT', v_delta, coalesce(v_novo_rend, v_novas),
          case when v_delta > 0 then v_custo end, trim(p_motivo), p_autor)
  returning id into v_mov;

  -- O que a contagem achou a mais entra num lote (D5 da 10ª).
  if v_delta > 0 then
    if v_lote is not null then
      update public.product_batches set quantity = quantity + v_delta_emb where id = v_lote;
    else
      insert into public.product_batches (product_id, branch_id, batch_number, expires_at, quantity)
      values (p_produto, p_unidade, nullif(btrim(coalesce(p_lote_numero, '')), ''), p_lote_validade, v_delta_emb)
      returning id into v_lote;
    end if;
    insert into public.stock_movement_batches (movement_id, batch_id, quantity)
    values (v_mov, v_lote, v_delta_emb);
  end if;

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  -- O saldo de antes, na unidade da contagem (para o "de … para …").
  return case when v_upp is not null then
           case when coalesce(p_em_consumo, false) then v_rend_antes else round(v_rend_antes / v_upp, 4) end
         else coalesce(v_saldo, 0) end;
end $function$;

revoke execute on function public.estoque_ajuste_com_lote(uuid, uuid, numeric, boolean, text, text, uuid, text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.estoque_ajuste_com_lote(uuid, uuid, numeric, boolean, text, text, uuid, text, timestamp with time zone) to service_role;

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
    select 'INVENTARIO', m.product_id,
           abs(m.quantity),
           abs(m.quantity) / public.fator_de_consumo(p),
           public.custo_do_movimento(m, p)
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'MANUAL_ADJUSTMENT' and m.quantity < 0
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
