-- F54 — os defeitos de estoque da 11ª simulação (2026-11-10).
--
-- D2: a PRIMEIRA linha da unidade (branch_product_stock) herda o mínimo do
--     cadastro do produto. As funções de estoque criavam a linha com
--     min_stock 0 (a entrada, o ajuste, a transferência, a perda, a venda…), e
--     o "3" digitado no cadastro nunca valia na unidade. Um gatilho só, antes do
--     INSERT, cobre todo caminho que faz a linha nascer — o de hoje e o próximo.
--     O mínimo salvo à mão na unidade ("Salvar mínimo") é gravado depois, por
--     UPDATE, e vale como foi digitado (inclusive 0).
-- D4: a tela dos lotes lia o custo só da ENTRADA (PURCHASE) e dizia "custo —"
--     no lote que o ajuste de inventário criou, que vale o último custo na
--     conta (custo_do_lote). `custos_dos_lotes` é a MESMA fonte, para a tela.
-- D5: o ajuste de inventário se desfaz enquanto nada saiu do lote depois dele
--     (estoque_desfazer_ajuste), como a entrada (estoque_desfazer_entrada); o
--     ajuste desfeito e o movimento que o desfaz saem de "Perdas no período".
-- D6: o custo por unidade de consumo do insumo do procedimento com 4 casas
--     (procedure_products.unit_cost era numeric(10,2): R$ 0,038/g virava 0,04).
-- A48: a marca de quando o sino avisou o mínimo daquela linha (uma vez por
--     cruzamento; o job estoque-minimo a limpa quando a linha sai do mínimo).

-- D6 ------------------------------------------------------------------------
alter table public.procedure_products alter column unit_cost type numeric(12,4);

-- A48 -----------------------------------------------------------------------
alter table public.branch_product_stock add column if not exists minimo_avisado_em timestamptz;
comment on column public.branch_product_stock.minimo_avisado_em is
  'Quando o sino avisou que esta linha está no mínimo ou abaixo (A48 da 11ª). Nulo: não avisado, ou saiu do mínimo depois do aviso. O job estoque-minimo grava e limpa.';

-- D2 ------------------------------------------------------------------------
create or replace function private.bps_minimo_do_produto()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_minimo numeric;
begin
  if coalesce(new.min_stock, 0) = 0 then
    select coalesce(p.min_stock, 0) into v_minimo from public.products p where p.id = new.product_id;
    new.min_stock := coalesce(v_minimo, 0);
  end if;
  return new;
end
$function$;

create or replace trigger trg_bps_minimo_do_produto
  before insert on public.branch_product_stock
  for each row execute function private.bps_minimo_do_produto();

-- D4 ------------------------------------------------------------------------
create or replace function public.custos_dos_lotes(p_lotes uuid[])
returns table (lote uuid, custo numeric, origem text)
language sql
stable
set search_path to ''
as $function$
  select b.id,
         public.custo_do_lote(b.id),
         coalesce(
           (select case m.type when 'PURCHASE' then 'ENTRADA' when 'MANUAL_ADJUSTMENT' then 'AJUSTE' end
              from public.stock_movement_batches smb
              join public.stock_movements m on m.id = smb.movement_id
             where smb.batch_id = b.id and m.quantity > 0 and m.unit_cost is not null
               and m.type in ('PURCHASE', 'MANUAL_ADJUSTMENT')
             order by m.created_at, m.id
             limit 1),
           case when public.custo_do_lote(b.id) is not null then 'TRANSFERENCIA' end)
    from public.product_batches b
   where b.id = any (p_lotes)
$function$;

revoke execute on function public.custos_dos_lotes(uuid[]) from public, anon, authenticated;
grant execute on function public.custos_dos_lotes(uuid[]) to service_role;

-- D5 ------------------------------------------------------------------------
create or replace function public.estoque_desfazer_ajuste(p_tenant uuid, p_movimento uuid, p_motivo text, p_autor text)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_m          public.stock_movements%rowtype;
  v_p          public.products%rowtype;
  v_fator      numeric;
  v_upp        numeric;
  v_emb        numeric;
  v_qtd        numeric;
  v_lote       uuid;
  v_ligada     numeric;
  v_qtd_lote   numeric;
  v_saldo      numeric;
  v_rendimento numeric;
  v_novas      numeric;
  v_novo_rend  numeric;
  v_mov        uuid;
  v_lig        record;
begin
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Diga por que o ajuste é desfeito.' using errcode = 'P0001';
  end if;

  select m.* into v_m
    from public.stock_movements m
    join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
   where m.id = p_movimento and m.type = 'MANUAL_ADJUSTMENT' and m.quantity <> 0
     and coalesce(m.reference, '') not like 'voucher:%'
   for update of m;
  if not found then
    raise exception 'Ajuste não encontrado.' using errcode = 'P0001';
  end if;
  if v_m.desfeita_em is not null then
    raise exception 'Este ajuste já foi desfeito.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.stock_movements o where o.desfeita_pelo = v_m.id) then
    raise exception 'Este movimento desfaz outro ajuste: ele não se desfaz.' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = v_m.product_id;
  v_fator := coalesce(public.fator_de_consumo(v_p), 1);
  v_upp   := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  v_qtd   := abs(v_m.quantity);
  v_emb   := v_qtd / v_fator;

  select s.current_stock, s.current_rendimento into v_saldo, v_rendimento
    from public.branch_product_stock s
   where s.product_id = v_m.product_id and s.branch_id = v_m.branch_id
   for update;

  if v_m.quantity > 0 then
    -- O que a contagem achou a MAIS entrou num lote: sai dele, se nada saiu
    -- dele depois do ajuste.
    select smb.batch_id, smb.quantity into v_lote, v_ligada
      from public.stock_movement_batches smb
     where smb.movement_id = v_m.id
     limit 1;
    if v_lote is not null then
      select b.quantity into v_qtd_lote from public.product_batches b where b.id = v_lote for update;
      if exists (select 1 from public.stock_movement_batches x
                   join public.stock_movements o on o.id = x.movement_id
                  where x.batch_id = v_lote and o.id <> v_m.id and o.quantity < 0
                    and (o.created_at, o.id) > (v_m.created_at, v_m.id))
         or round(coalesce(v_qtd_lote, 0), 6) < round(v_ligada, 6) then
        raise exception 'O lote deste ajuste já teve saída: corrija por um novo ajuste (inventário).' using errcode = 'P0001';
      end if;
    elsif exists (select 1 from public.product_batches b
                   where b.product_id = v_m.product_id and b.branch_id = v_m.branch_id and b.quantity > 0) then
      raise exception 'Este ajuste não tem lote, e o produto tem lotes com saldo nesta unidade: corrija por um novo ajuste (inventário).' using errcode = 'P0001';
    end if;

    v_novas := coalesce(v_saldo, 0) - v_emb;
    if round(v_novas, 6) < 0 then
      raise exception 'O saldo já não tem o que este ajuste trouxe: corrija por um novo ajuste (inventário).' using errcode = 'P0001';
    end if;
    v_novo_rend := case when v_upp is not null then coalesce(v_rendimento, coalesce(v_saldo, 0) * v_upp) - v_qtd end;
    if v_upp is not null then
      v_novas := ceil(round(v_novo_rend / v_upp, 6));
    end if;

    -- Negativo, com o lote na referência: o gatilho do lote tira dele.
    insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference)
    values (v_m.branch_id, v_m.product_id, 'MANUAL_ADJUSTMENT', -v_qtd, coalesce(v_novo_rend, v_novas), v_m.unit_cost,
            'Ajuste desfeito: ' || btrim(p_motivo), p_autor,
            case when v_lote is not null then 'lote:' || v_lote::text end)
    returning id into v_mov;
  else
    -- O que a contagem achou a MENOS saiu dos lotes (o gatilho os ligou):
    -- volta a eles, se nada mais saiu deles depois do ajuste.
    if exists (select 1 from public.stock_movement_batches l
                 join public.stock_movement_batches x on x.batch_id = l.batch_id
                 join public.stock_movements o on o.id = x.movement_id
                where l.movement_id = v_m.id and o.id <> v_m.id and o.quantity < 0
                  and (o.created_at, o.id) > (v_m.created_at, v_m.id)) then
      raise exception 'Já saiu mais do lote depois deste ajuste: corrija por um novo ajuste (inventário).' using errcode = 'P0001';
    end if;

    v_novas := coalesce(v_saldo, 0) + v_emb;
    v_novo_rend := case when v_upp is not null then coalesce(v_rendimento, coalesce(v_saldo, 0) * v_upp) + v_qtd end;
    if v_upp is not null then
      v_novas := ceil(round(v_novo_rend / v_upp, 6));
    end if;

    -- Positivo: o gatilho do lote não mexe nele; a volta a cada lote é daqui.
    insert into public.stock_movements (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by)
    values (v_m.branch_id, v_m.product_id, 'MANUAL_ADJUSTMENT', v_qtd, coalesce(v_novo_rend, v_novas), v_m.unit_cost,
            'Ajuste desfeito: ' || btrim(p_motivo), p_autor)
    returning id into v_mov;

    for v_lig in
      select smb.batch_id as v_batch, smb.quantity as v_quant
        from public.stock_movement_batches smb
       where smb.movement_id = v_m.id
    loop
      update public.product_batches set quantity = quantity + v_lig.v_quant where id = v_lig.v_batch;
      insert into public.stock_movement_batches (movement_id, batch_id, quantity)
      values (v_mov, v_lig.v_batch, v_lig.v_quant);
    end loop;
  end if;

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = v_m.product_id and branch_id = v_m.branch_id;

  update public.stock_movements
     set desfeita_em = now(), desfeita_por = p_autor, desfeita_motivo = btrim(p_motivo), desfeita_pelo = v_mov
   where id = v_m.id;

  return v_novas;
end
$function$;

revoke execute on function public.estoque_desfazer_ajuste(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.estoque_desfazer_ajuste(uuid, uuid, text, text) to service_role;

-- D5: o ajuste desfeito (e o movimento que o desfaz) não é perda. Parte do
-- corpo ATUAL da produção (20261110004903): só o ramo do Inventário mudou.
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
    select 'INVENTARIO', m.product_id,
           abs(m.quantity),
           abs(m.quantity) / public.fator_de_consumo(p),
           public.custo_do_movimento(m, p)
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = m.product_id
     where m.type = 'MANUAL_ADJUSTMENT' and m.quantity < 0
       and m.desfeita_em is null
       and not exists (select 1 from public.stock_movements o where o.desfeita_pelo = m.id)
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
