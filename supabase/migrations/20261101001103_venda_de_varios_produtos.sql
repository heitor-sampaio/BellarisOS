-- ven-04 da revisão das decisões (2026-11-02, "mudar"): a venda de produto leva
-- VÁRIOS produtos e um pagamento só ("a Carla leva 2 séruns e 1 protetor; a
-- Bruna faz duas vendas e recebe duas vezes").
--
-- O desenho: `product_sales` continua sendo A VENDA (o dinheiro, a comissão, o
-- estorno e as Vendas apontam para ela), e os produtos vão em
-- `product_sale_items` — um por produto, com a quantidade, o preço, o custo do
-- que saiu e o movimento de estoque dele. Na venda nova, o cabeçalho guarda o
-- TOTAL (tabela, desconto, vendido, custo, unidades) e, nas colunas de antes
-- (`product_id`, `preco_unitario`, `stock_movement_id`), o PRIMEIRO item —
-- nada que já lia a venda quebra. Quem precisa dos produtos lê os itens (ou
-- `descricao`, "2× Sérum + 1× Protetor"). As vendas de antes não têm itens:
-- os leitores caem no cabeçalho, como sempre.

alter table public.product_sales add column if not exists descricao text;

create table if not exists public.product_sale_items (
  id                    uuid primary key default gen_random_uuid(),
  sale_id               uuid not null references public.product_sales(id) on delete cascade,
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  product_id            uuid not null references public.products(id),
  sort_order            integer not null default 0,
  quantity              integer not null check (quantity between 1 and 100),
  preco_unitario        numeric not null check (preco_unitario >= 0),
  preco_tabela          numeric not null check (preco_tabela >= 0),
  custo                 numeric not null default 0,
  stock_movement_id     uuid references public.stock_movements(id),
  devolucao_movement_id uuid references public.stock_movements(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (sale_id, product_id)
);
create index if not exists product_sale_items_sale_idx on public.product_sale_items (sale_id);

alter table public.product_sale_items enable row level security;

-- A sessão só LÊ, como a venda: a equipe que alcança a unidade, a cliente a dela.
create policy product_sale_items_select on public.product_sale_items for select
  using (exists (
    select 1 from public.product_sales s
     where s.id = product_sale_items.sale_id
       and (((jwt_claim('role') <> 'CLIENT') and (s.tenant_id::text = jwt_claim('tenant_id')) and private.can_access_branch(s.branch_id))
         or ((jwt_claim('role') = 'CLIENT') and (s.client_id in (select private.clientes_do_login()))))
  ));

-- As restritivas do suporte (§14): a sessão de suporte não grava pelo PostgREST.
create policy suporte_sem_escrita_ins on public.product_sale_items as restrictive for insert
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_upd on public.product_sale_items as restrictive for update
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end)
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_del on public.product_sale_items as restrictive for delete
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);

-- A venda de VÁRIOS produtos. `p_itens`: [{ product_id, quantity }] (o mesmo
-- produto em duas linhas vira uma, somada). `p_vendedor` é quem vendeu (quem
-- leva a comissão e aparece em Vendas); `p_ator`, quem registrou. Uma
-- transação: cada saldo travado (na ordem do produto, para duas vendas não se
-- travarem uma à outra), a baixa de cada um pelo lote que vence primeiro, a
-- venda com os itens, a comissão e o dinheiro. Sem estoque de UM, nada grava.
create or replace function public.produto_vender_itens(
  p_tenant uuid, p_cliente uuid, p_unidade uuid, p_ator uuid, p_vendedor uuid,
  p_itens jsonb, p_desconto numeric, p_lancamentos jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente    text;
  v_it         record;
  v_p          public.products%rowtype;
  v_upp        numeric;
  v_fator      numeric;
  v_saldo      numeric;
  v_rend       numeric;
  v_disponivel numeric;
  v_unit       numeric;
  v_falta      numeric;
  v_tira       numeric;
  v_soma       numeric;
  v_peso       numeric;
  v_custo_un   numeric;
  v_l          record;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_mov        uuid;
  v_venda      uuid;
  v_tabela     numeric := 0;
  v_custo      numeric := 0;
  v_qtd_total  integer := 0;
  v_desconto   numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido    numeric;
  v_descricao  text;
  v_primeiro   record;
  v_cfg        public.commission_configs%rowtype;
  v_agora      timestamptz := now();
  v_ordem      integer := 0;
  v_itens      jsonb;
begin
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select c.name into v_cliente from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrada: a venda de produto é para uma cliente cadastrada.' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha ao menos um produto.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > 20 then
    raise exception 'Uma venda leva até 20 produtos.' using errcode = 'P0001';
  end if;
  if p_vendedor is not null and not exists (
    select 1 from public.users u where u.id = p_vendedor and u.tenant_id = p_tenant and coalesce(u.is_active, true)
  ) then
    raise exception 'Quem vendeu não é da equipe desta clínica.' using errcode = 'P0001';
  end if;

  -- Os itens, somados por produto, na ordem em que vieram.
  select jsonb_agg(jsonb_build_object('ordem', o, 'product_id', pid, 'quantity', q))
    into v_itens
    from (select min(n)::int o, (x ->> 'product_id')::uuid pid, sum((x ->> 'quantity')::int)::int q
            from jsonb_array_elements(p_itens) with ordinality t(x, n)
           group by (x ->> 'product_id')::uuid) a;
  if exists (select 1 from jsonb_array_elements(v_itens) x
              where (x ->> 'product_id') is null or (x ->> 'quantity') is null
                 or (x ->> 'quantity')::int < 1 or (x ->> 'quantity')::int > 100) then
    raise exception 'Quantidade inválida (de 1 a 100 de cada produto).' using errcode = 'P0001';
  end if;
  select coalesce(sum((x ->> 'quantity')::int), 0) into v_qtd_total from jsonb_array_elements(v_itens) x;
  if v_qtd_total > 100 then
    raise exception 'Uma venda leva até 100 unidades.' using errcode = 'P0001';
  end if;

  -- 1. Conferir cada produto e o estoque, com o saldo travado (na ordem do id).
  for v_it in select * from (select (x ->> 'ordem')::int as ordem, (x ->> 'product_id')::uuid as product_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_itens) x) i order by product_id loop
    select * into v_p from public.products p where p.id = v_it.product_id and p.tenant_id = p_tenant;
    if not found then
      raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
    end if;
    if not coalesce(v_p.is_active, true) then
      raise exception '% está desativado.', v_p.name using errcode = 'P0001';
    end if;
    if v_p.uso not in ('REVENDA', 'AMBOS') or v_p.sale_price is null or v_p.sale_price <= 0 then
      raise exception '% não é de revenda: marque o uso e o preço de venda no cadastro.', v_p.name using errcode = 'P0001';
    end if;
    v_upp := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
    select s.current_stock, s.current_rendimento into v_saldo, v_rend
      from public.branch_product_stock s
     where s.product_id = v_it.product_id and s.branch_id = p_unidade
     for update;
    if v_upp is not null then
      v_rend       := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
      v_disponivel := floor(round(greatest(v_rend, 0) / v_upp, 6));
    else
      v_disponivel := floor(greatest(coalesce(v_saldo, 0), 0));
    end if;
    if v_it.quantity > v_disponivel then
      raise exception 'Estoque insuficiente: há % % de % nesta unidade.',
        trim_scale(v_disponivel), v_p.unit, v_p.name using errcode = 'P0001';
    end if;
    v_tabela := v_tabela + round(v_p.sale_price, 2) * v_it.quantity;
  end loop;

  if v_desconto < 0 or v_desconto > v_tabela then
    raise exception 'O desconto não pode ser maior que o valor da venda.' using errcode = 'P0001';
  end if;
  v_vendido := v_tabela - v_desconto;
  if (select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l) <> v_vendido then
    raise exception 'O pagamento não fecha com o valor da venda.' using errcode = 'P0001';
  end if;

  select string_agg(i.quantity || '× ' || p.name, ' + ' order by i.ordem)
    into v_descricao
    from (select (x ->> 'ordem')::int as ordem, (x ->> 'product_id')::uuid as product_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_itens) x) i join public.products p on p.id = i.product_id;
  select i.product_id, i.quantity, round(p.sale_price, 2) as unit
    into v_primeiro
    from (select (x ->> 'ordem')::int as ordem, (x ->> 'product_id')::uuid as product_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_itens) x) i join public.products p on p.id = i.product_id
   order by i.ordem limit 1;

  -- 2. A venda (o custo entra depois, somado dos itens).
  insert into public.product_sales
    (tenant_id, branch_id, client_id, product_id, quantity, preco_unitario, preco_tabela, desconto, price,
     custo, sold_by, sold_at, descricao)
  values (p_tenant, p_unidade, p_cliente, v_primeiro.product_id, v_qtd_total, v_primeiro.unit, v_tabela, v_desconto, v_vendido,
          0, p_vendedor, v_agora, v_descricao)
  returning id into v_venda;

  -- 3. Cada produto: o custo do que sai (o dos lotes que o FEFO tira), a baixa e o item.
  for v_it in select * from (select (x ->> 'ordem')::int as ordem, (x ->> 'product_id')::uuid as product_id, (x ->> 'quantity')::int as quantity from jsonb_array_elements(v_itens) x) i order by ordem loop
    select * into v_p from public.products p where p.id = v_it.product_id;
    v_upp   := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
    v_fator := public.fator_de_consumo(v_p);
    v_unit  := round(v_p.sale_price, 2);
    select s.current_stock, s.current_rendimento into v_saldo, v_rend
      from public.branch_product_stock s
     where s.product_id = v_it.product_id and s.branch_id = p_unidade;

    v_falta := v_it.quantity; v_soma := 0; v_peso := 0;
    for v_l in
      select b.id, b.quantity,
             (select m.unit_cost from public.stock_movement_batches smb
                join public.stock_movements m on m.id = smb.movement_id
               where smb.batch_id = b.id and m.type = 'PURCHASE' and m.unit_cost is not null limit 1) as custo
        from public.product_batches b
       where b.product_id = v_it.product_id and b.branch_id = p_unidade and b.quantity > 0
       order by coalesce(b.expires_at < current_date, false), b.expires_at nulls last, b.received_at
    loop
      exit when v_falta <= 0;
      v_tira := least(v_l.quantity, v_falta);
      if v_l.custo is not null then
        v_soma := v_soma + v_tira * v_l.custo;
        v_peso := v_peso + v_tira;
      end if;
      v_falta := v_falta - v_tira;
    end loop;
    v_custo_un := case when v_peso > 0 then v_soma / v_peso else public.custo_de_consumo(v_p) end;

    if v_upp is not null then
      v_rend      := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
      v_novo_rend := v_rend - v_it.quantity * v_upp;
      v_novas     := ceil(round(v_novo_rend / v_upp, 6));
    else
      v_novas     := coalesce(v_saldo, 0) - v_it.quantity;
      v_novo_rend := null;
    end if;

    insert into public.stock_movements
      (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference)
    values (p_unidade, v_it.product_id, 'SALE', -(v_it.quantity * v_fator), coalesce(v_novo_rend, v_novas), v_custo_un,
            'Venda — ' || v_cliente, coalesce(p_ator::text, 'sistema'), 'venda:' || v_venda)
    returning id into v_mov;

    update public.branch_product_stock
       set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
     where product_id = v_it.product_id and branch_id = p_unidade;

    v_ordem := v_ordem + 1;
    insert into public.product_sale_items
      (sale_id, tenant_id, product_id, sort_order, quantity, preco_unitario, preco_tabela, custo, stock_movement_id)
    values (v_venda, p_tenant, v_it.product_id, v_ordem, v_it.quantity, v_unit, v_unit * v_it.quantity,
            round(coalesce(v_custo_un, 0) * v_it.quantity * v_fator, 2), v_mov);
    v_custo := v_custo + round(coalesce(v_custo_un, 0) * v_it.quantity * v_fator, 2);

    if v_it.product_id = v_primeiro.product_id then
      update public.product_sales set stock_movement_id = v_mov where id = v_venda;
    end if;
  end loop;

  update public.product_sales set custo = v_custo where id = v_venda;

  -- 4. A comissão da venda (uma, sobre o total), para QUEM VENDEU.
  select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
  if p_vendedor is not null and coalesce(v_cfg.produto_pct, 0) > 0 then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, product_sale_id)
    values (p_tenant, p_unidade, null, 0, null, p_vendedor, 'PRODUTO',
            'PERCENTAGE', v_cfg.produto_pct, 'INTEGRAL', false, coalesce(v_cfg.desconta_taxa, false), 'PRECO', v_vendido, 0, v_venda);
  end if;

  -- 5. O dinheiro.
  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) as x(j)
  loop
    insert into public.financial_transactions
      (branch_id, client_id, product_sale_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes,
       desconto_motivo)
    values (
      p_unidade, p_cliente, v_venda, 'INCOME', 'Venda de produto',
      'Venda de produto — ' || v_descricao || coalesce(' — ' || nullif(v_l.j ->> 'sufixo', ''), ''),
      round((v_l.j ->> 'amount')::numeric, 2),
      nullif(v_l.j ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l.j ->> 'is_paid')::boolean, false),
      case when coalesce((v_l.j ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l.j ->> 'due_date', '')::timestamptz,
      nullif(v_l.j ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema'),
      nullif(v_l.j ->> 'parcela_numero', '')::int,
      nullif(v_l.j ->> 'parcela_total', '')::int,
      nullif(v_l.j ->> 'parcela_grupo', '')::uuid,
      nullif(v_l.j ->> 'cartao_vezes', '')::smallint,
      left(nullif(btrim(coalesce(v_l.j ->> 'desconto_motivo', '')), ''), 300)
    );
  end loop;

  return v_venda;
end $$;

revoke execute on function public.produto_vender_itens(uuid, uuid, uuid, uuid, uuid, jsonb, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.produto_vender_itens(uuid, uuid, uuid, uuid, uuid, jsonb, numeric, jsonb) to service_role;

-- O estorno da venda devolve CADA produto (os itens); a venda de antes, sem
-- itens, devolve o do cabeçalho, como sempre. O resto é o corpo da produção.
CREATE OR REPLACE FUNCTION public.produto_estornar_venda(p_tenant uuid, p_venda uuid, p_ator text, p_motivo text, p_voltou boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_v          public.product_sales%rowtype;
  v_p          public.products%rowtype;
  v_mov        public.stock_movements%rowtype;
  v_motivo     text := nullif(trim(coalesce(p_motivo, '')), '');
  v_cliente    text;
  v_tx         record;
  v_linha      uuid;
  v_upp        numeric;
  v_qtd        numeric;
  v_saldo      numeric;
  v_rend       numeric;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_dev        uuid;
  v_primeira   uuid;
  v_item       record;
begin
  if v_motivo is null then
    raise exception 'Diga o motivo do estorno.' using errcode = 'P0001';
  end if;
  if p_voltou is null then
    raise exception 'Diga se o produto voltou ao estoque.' using errcode = 'P0001';
  end if;

  select * into v_v from public.product_sales s where s.id = p_venda for update;
  if not found or v_v.tenant_id is distinct from p_tenant then
    raise exception 'Venda não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_v.estornada_em is not null then
    raise exception 'Esta venda já foi estornada.' using errcode = 'invalid_parameter_value';
  end if;
  select c.name into v_cliente from public.clients c where c.id = v_v.client_id;

  -- 1. O dinheiro. O pago, pelo estorno de sempre (a marca deixa passar a
  --    trava de estornar_transacao só para ESTA venda); o a receber sai
  --    marcado, sem contra-lançamento.
  perform set_config('bellaris.estorno_da_venda', p_venda::text, true);
  for v_tx in
    select f.id, f.is_paid from public.financial_transactions f
     where f.product_sale_id = p_venda and f.type = 'INCOME'
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno'
     order by f.created_at, f.id
     for update
  loop
    if v_tx.is_paid then
      perform public.estornar_transacao(v_tx.id, p_tenant, p_ator, v_motivo);
    else
      update public.financial_transactions
         set notes = 'Estornada', estorno_motivo = v_motivo, updated_at = now()
       where id = v_tx.id;
    end if;
  end loop;
  perform set_config('bellaris.estorno_da_venda', '', true);

  -- 2. A comissão da venda: cancelada, e o acerto devolve o que ela liberou.
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.product_sale_id = p_venda and cl.status <> 'CANCELADA'
  loop
    update public.commission_lines set status = 'CANCELADA' where id = v_linha;
    perform private.comissao_acertar_linha(v_linha, 'Estorno da venda de produto', null);
  end loop;

  -- 3. O produto que voltou: ao saldo (linha travada) e aos lotes de onde a
  --    venda o tirou — cada item (na ordem do produto); a venda de antes, o do
  --    cabeçalho. Não voltou: o estoque fica — é perda (metrics_perdas).
  if p_voltou then
    for v_item in
      select i.id, i.product_id, i.quantity, i.stock_movement_id
        from public.product_sale_items i where i.sale_id = p_venda
      union all
      select null::uuid, v_v.product_id, v_v.quantity, v_v.stock_movement_id
       where not exists (select 1 from public.product_sale_items i where i.sale_id = p_venda)
      order by 2
    loop
      select * into v_p from public.products p where p.id = v_item.product_id;
      v_mov := null;
      select * into v_mov from public.stock_movements m where m.id = v_item.stock_movement_id;
      v_qtd := case when v_mov.id is not null then -v_mov.quantity
                    else v_item.quantity * public.fator_de_consumo(v_p) end;
      v_upp := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
      select s.current_stock, s.current_rendimento into v_saldo, v_rend
        from public.branch_product_stock s
       where s.product_id = v_item.product_id and s.branch_id = v_v.branch_id
       for update;
      if not found then
        raise exception 'Não achei o estoque de % na unidade.', v_p.name using errcode = 'no_data_found';
      end if;
      if v_upp is not null then
        v_rend      := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
        v_novo_rend := v_rend + v_qtd;
        v_novas     := ceil(round(v_novo_rend / v_upp, 6));
      else
        v_novas     := coalesce(v_saldo, 0) + v_qtd;
        v_novo_rend := null;
      end if;

      insert into public.stock_movements
        (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference)
      values (v_v.branch_id, v_item.product_id, 'SALE_RETURN', v_qtd, coalesce(v_novo_rend, v_novas), v_mov.unit_cost,
              'Devolução — estorno da venda — ' || coalesce(v_cliente, 'cliente'), coalesce(p_ator, 'sistema'), 'venda:' || p_venda)
      returning id into v_dev;
      v_primeira := coalesce(v_primeira, v_dev);

      update public.branch_product_stock
         set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
       where product_id = v_item.product_id and branch_id = v_v.branch_id;

      if v_mov.id is not null then
        update public.product_batches b
           set quantity = b.quantity + smb.quantity
          from public.stock_movement_batches smb
         where smb.movement_id = v_mov.id and smb.batch_id = b.id;
        insert into public.stock_movement_batches (movement_id, batch_id, quantity)
        select v_dev, smb.batch_id, smb.quantity
          from public.stock_movement_batches smb
         where smb.movement_id = v_mov.id;
      end if;
      if v_item.id is not null then
        update public.product_sale_items set devolucao_movement_id = v_dev where id = v_item.id;
      end if;
    end loop;
  end if;

  -- 4. A venda.
  update public.product_sales
     set estornada_em = now(), estornada_por = p_ator, estorno_motivo = v_motivo,
         produto_voltou = p_voltou, devolucao_movement_id = v_primeira
   where id = p_venda;

  return p_venda;
end
$function$;

-- As Vendas dizem os produtos do kit ("2× Sérum + 1× Protetor") e o total de
-- unidades; a venda de antes, o produto do cabeçalho. O resto é o corpo da produção.
CREATE OR REPLACE FUNCTION public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  -- sem nenhuma sessão feita, sai.
  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price - coalesce(cp.valor_cancelado, 0)
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
   where cp.purchased_at between p_from and p_to
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
    left join public.users u on u.id = tp.professional_id
   where tp.status in ('ACCEPTED', 'COMPLETED')
     and tp.aceito_em between p_from and p_to
     and (p_professional_id is null or tp.professional_id = p_professional_id)

  -- A venda de produto (D4, 2026-10-30): na data da venda, pelo vendido, e
  -- "quem vendeu" na coluna Profissional (o recorte do "só os meus"). A
  -- ESTORNADA não é venda (H2, 2026-11-01). O kit (ven-04) diz os produtos.
  union all
  select ps.id, 'PRODUTO', ps.sold_at, coalesce(ps.descricao, p.name), ps.quantity,
         ps.client_id, c.name, u.name, ps.branch_id, ps.price
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

-- A venda estornada que não voltou é perda POR PRODUTO (os itens do kit); a de
-- antes, o produto do cabeçalho. O resto é o corpo da produção.
CREATE OR REPLACE FUNCTION public.metrics_perdas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(motivo text, product_id uuid, produto text, unidade text, embalagem text, quantidade numeric, embalagens numeric, custo numeric, movimentos bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    select 'VENDA_ESTORNADA', coalesce(i.product_id, v.product_id),
           coalesce(i.quantity, v.quantity) * public.fator_de_consumo(p),
           coalesce(i.quantity, v.quantity)::numeric,
           coalesce(i.custo, v.custo)
      from public.product_sales v
      join public.branches b on b.id = v.branch_id and b.tenant_id = p_tenant
      left join public.product_sale_items i on i.sale_id = v.id
      left join public.products p on p.id = coalesce(i.product_id, v.product_id)
     where v.tenant_id = p_tenant
       and v.estornada_em is not null and v.produto_voltou = false
       and (p_branch_ids is null or v.branch_id = any (p_branch_ids))
       and v.estornada_em between p_from and p_to
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

-- O extrato da comissão diz os produtos do kit. O resto é o corpo da produção.
CREATE OR REPLACE FUNCTION public.comissoes_extrato(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
 RETURNS TABLE(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric, pacote text, desconta_taxa boolean, desconta_insumos boolean, previsto numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         x.amount, x.status, x.payout_id, x.appointment_id, coalesce(a.scheduled_at, ps.sold_at, cp.purchased_at),
         coalesce(cli.name, cps.name, ccp.name), coalesce(pr.name, ps.descricao, prod.name, sp.name), l.origem, l.preco, l.regra_tipo::text, l.regra_valor,
         sp.name, l.desconta_taxa, l.desconta_insumos, x.previsto
    from itens x
    left join public.commission_lines l on l.id = x.line_id
    left join public.appointments a on a.id = x.appointment_id
    left join public.clients cli on cli.id = a.client_id
    left join public.procedures pr on pr.id = coalesce(l.procedure_id, a.procedure_id)
    left join public.product_sales ps on ps.id = l.product_sale_id
    left join public.clients cps on cps.id = ps.client_id
    left join public.products prod on prod.id = ps.product_id
    left join public.client_packages cp on cp.id = l.client_package_id
    left join public.service_packages sp on sp.id = cp.package_id
    left join public.clients ccp on ccp.id = cp.client_id
   order by x.released_at desc, x.id
$function$;

notify pgrst, 'reload schema';
