-- D4 (decisão do Heitor, 2026-10-29): a VENDA DE PRODUTO.
-- "Produto entra no 'Vender' da ficha da cliente, com quantidade, desconto e
-- forma de pagamento. O estoque baixa pelo lote que vence primeiro. A venda
-- vai para o caixa, para as vendas e para o faturamento. Os pontos são
-- configuráveis pela clínica. Exige cliente cadastrada."
--
-- 1. product_sales: a venda, com o RETRATO do preço (unitário e de tabela), do
--    desconto, do vendido, do CUSTO do que saiu (o custo dos lotes que o FEFO
--    tirou — a base do custo do produto vendido), de quem vendeu e do
--    movimento de estoque. Só o servidor grava (como procedure_sales): a
--    sessão LÊ — a equipe que alcança a unidade, a cliente a dela —, e as
--    restritivas do suporte valem.
-- 2. financial_transactions.product_sale_id: o dinheiro da venda.
-- 3. loyalty_configs.pontua_venda_de_produto (nasce DESLIGADO, como todo
--    opcional da fidelidade): ligado, a venda paga dá pontos por real pago
--    (points_per_real), em qualquer modo de ganho — produto não tem os "pontos
--    do procedimento".
-- 4. produto_vender: UMA transação — a venda, a baixa (movimento SALE, pelo
--    gatilho do lote: o que vence primeiro), o saldo e o dinheiro. Só produto
--    de REVENDA (D-6), com preço de venda; vende EMBALAGENS inteiras (a aberta
--    não se vende); sem estoque suficiente, recusa. Nunca grava despesa.
-- 5. metrics_vendas: a venda de produto é uma linha do relatório de vendas
--    (tipo PRODUTO, na data da venda, pelo vendido, "quem vendeu").

-- 1 ---------------------------------------------------------------------------
create table if not exists public.product_sales (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  branch_id         uuid not null references public.branches(id),
  client_id         uuid not null references public.clients(id),
  product_id        uuid not null references public.products(id),
  quantity          integer not null check (quantity between 1 and 100),
  preco_unitario    numeric(12,2) not null check (preco_unitario >= 0),
  preco_tabela      numeric(12,2) not null check (preco_tabela >= 0),
  desconto          numeric(12,2) not null default 0 check (desconto >= 0),
  price             numeric(12,2) not null check (price >= 0),
  custo             numeric(12,2) not null default 0,
  stock_movement_id uuid references public.stock_movements(id),
  sold_by           uuid references public.users(id),
  sold_at           timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  check (price = preco_tabela - desconto)
);
create index if not exists product_sales_tenant_sold_at on public.product_sales (tenant_id, sold_at);
create index if not exists product_sales_branch on public.product_sales (branch_id);
create index if not exists product_sales_client on public.product_sales (client_id);

alter table public.product_sales enable row level security;

create policy product_sales_select on public.product_sales for select using (
  ((jwt_claim('role') <> 'CLIENT') and ((tenant_id)::text = jwt_claim('tenant_id')) and private.can_access_branch(branch_id))
  or ((jwt_claim('role') = 'CLIENT') and (client_id in (select private.clientes_do_login())))
);

create policy suporte_sem_escrita_ins on public.product_sales as restrictive for insert with check (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_upd on public.product_sales as restrictive for update using (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
) with check (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);
create policy suporte_sem_escrita_del on public.product_sales as restrictive for delete using (
  case when (nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null) then true
       else (not private.suporte_sem_escrita()) end
);

-- 2 ---------------------------------------------------------------------------
alter table public.financial_transactions
  add column if not exists product_sale_id uuid references public.product_sales(id) on delete set null;
create index if not exists financial_transactions_product_sale
  on public.financial_transactions (product_sale_id) where product_sale_id is not null;

-- 3 ---------------------------------------------------------------------------
alter table public.loyalty_configs
  add column if not exists pontua_venda_de_produto boolean not null default false;

create or replace function public.fidelidade_pontos_do_pagamento(p_tx financial_transactions, p_cfg loyalty_configs)
 returns integer
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_total     numeric;
  v_pago      numeric;
  v_ja        int;
  v_plano_pts numeric;
  v_alvo      int;
begin
  -- A venda de produto (D4): só pontua se a clínica ligou, e por real pago.
  if p_tx.product_sale_id is not null then
    if not coalesce(p_cfg.pontua_venda_de_produto, false) then
      return 0;
    end if;
    return floor(p_tx.amount * p_cfg.points_per_real)::int;
  end if;

  if p_cfg.earn_mode = 'POR_PROCEDIMENTO' and (p_tx.procedure_sale_id is not null or p_tx.client_package_id is not null) then
    if p_tx.procedure_sale_id is not null then
      select ps.price - coalesce(sum(u.preco) filter (where u.status = 'CANCELADA'), 0),
             coalesce(pr.loyalty_points, 0) * count(*) filter (where u.status <> 'CANCELADA')
        into v_total, v_plano_pts
        from public.procedure_sales ps
        join public.procedures pr on pr.id = ps.procedure_id
        left join public.procedure_sale_units u on u.sale_id = ps.id
       where ps.id = p_tx.procedure_sale_id
       group by ps.price, pr.loyalty_points;
    else
      select cp.price, coalesce(sum(coalesce(pr.loyalty_points, 0)), 0)
        into v_total, v_plano_pts
        from public.client_packages cp
        left join public.package_sessions s on s.client_package_id = cp.id
        left join public.procedures pr on pr.id = s.procedure_id
       where cp.id = p_tx.client_package_id
       group by cp.price;
    end if;

    select coalesce(sum(f.amount), 0) into v_pago
      from public.financial_transactions f
     where ((p_tx.procedure_sale_id is not null and f.procedure_sale_id = p_tx.procedure_sale_id)
         or (p_tx.procedure_sale_id is null and f.client_package_id = p_tx.client_package_id))
       and f.type = 'INCOME' and f.is_paid
       and f.category <> 'Estorno' and coalesce(f.notes, '') <> 'Estornada'
       and f.payment_method is distinct from 'INTERNAL_CREDIT';

    select coalesce(sum(l.points), 0)::int into v_ja
      from public.loyalty_transactions l
      join public.financial_transactions f on f.id = l.transaction_id
     where ((p_tx.procedure_sale_id is not null and f.procedure_sale_id = p_tx.procedure_sale_id)
         or (p_tx.procedure_sale_id is null and f.client_package_id = p_tx.client_package_id))
       and l.kind in ('GANHO', 'ESTORNO_GANHO');

    v_alvo := case when coalesce(v_total, 0) > 0
                   then floor(coalesce(v_plano_pts, 0) * least(v_pago, v_total) / v_total)::int
                   else 0 end;
    return greatest(v_alvo - v_ja, 0);
  end if;

  if p_tx.treatment_plan_id is not null then
    select coalesce(sum(p.price), 0)
      into v_total
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = p_tx.treatment_plan_id;

    select coalesce(sum(f.amount), 0)
      into v_pago
      from public.financial_transactions f
     where f.treatment_plan_id = p_tx.treatment_plan_id
       and f.type = 'INCOME'
       and f.is_paid
       and f.category <> 'Estorno'
       and coalesce(f.notes, '') <> 'Estornada'
       and f.payment_method is distinct from 'INTERNAL_CREDIT';

    select coalesce(sum(l.points), 0)::int
      into v_ja
      from public.loyalty_transactions l
     where l.treatment_plan_id = p_tx.treatment_plan_id
       and l.kind in ('GANHO', 'ESTORNO_GANHO');

    if p_cfg.earn_mode = 'POR_PROCEDIMENTO' then
      select coalesce(sum(coalesce(pr.loyalty_points, 0)), 0)
        into v_plano_pts
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
        join public.procedures pr on pr.id = p.procedure_id
       where s.plan_id = p_tx.treatment_plan_id;
      v_alvo := case when v_total > 0
                     then floor(v_plano_pts * least(v_pago, v_total) / v_total)::int
                     else 0 end;
    else
      v_alvo := floor(v_pago * p_cfg.points_per_real)::int;
    end if;

    return greatest(v_alvo - v_ja, 0);
  end if;

  if p_cfg.earn_mode = 'POR_PROCEDIMENTO' then
    if p_tx.appointment_id is null then
      return 0;
    end if;
    select coalesce(pr.loyalty_points, 0)
      into v_alvo
      from public.appointments ap
      join public.procedures pr on pr.id = ap.procedure_id
     where ap.id = p_tx.appointment_id;
    return coalesce(v_alvo, 0);
  end if;

  return floor(p_tx.amount * p_cfg.points_per_real)::int;
end;
$function$;

-- 4 ---------------------------------------------------------------------------
create or replace function public.produto_vender(
  p_tenant uuid, p_cliente uuid, p_produto uuid, p_unidade uuid, p_ator uuid,
  p_quantidade integer, p_desconto numeric, p_lancamentos jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p          public.products%rowtype;
  v_cliente    text;
  v_upp        numeric;
  v_fator      numeric;
  v_saldo      numeric;
  v_rend       numeric;
  v_disponivel numeric;
  v_unit       numeric;
  v_tabela     numeric;
  v_desconto   numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido    numeric;
  v_falta      numeric;
  v_tira       numeric;
  v_soma       numeric := 0;
  v_peso       numeric := 0;
  v_custo_un   numeric;
  v_l          record;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_venda      uuid;
  v_mov        uuid;
  v_agora      timestamptz := now();
begin
  select * into v_p from public.products p where p.id = p_produto and p.tenant_id = p_tenant;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not coalesce(v_p.is_active, true) then
    raise exception 'Este produto está desativado.' using errcode = 'P0001';
  end if;
  if v_p.uso not in ('REVENDA', 'AMBOS') or v_p.sale_price is null or v_p.sale_price <= 0 then
    raise exception 'Este produto não é de revenda: marque o uso e o preço de venda no cadastro.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select c.name into v_cliente from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrada: a venda de produto é para uma cliente cadastrada.' using errcode = 'no_data_found';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then
    raise exception 'Quantidade inválida (de 1 a 100).' using errcode = 'P0001';
  end if;

  v_unit   := round(v_p.sale_price, 2);
  v_tabela := v_unit * p_quantidade;
  if v_desconto < 0 or v_desconto > v_tabela then
    raise exception 'O desconto não pode ser maior que o valor da venda.' using errcode = 'P0001';
  end if;
  v_vendido := v_tabela - v_desconto;
  if (select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l) <> v_vendido then
    raise exception 'O pagamento não fecha com o valor da venda.' using errcode = 'P0001';
  end if;

  -- O saldo, travado. Vende EMBALAGENS inteiras: a aberta não se vende.
  v_upp   := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  v_fator := public.fator_de_consumo(v_p);
  select s.current_stock, s.current_rendimento into v_saldo, v_rend
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = p_unidade
   for update;
  if v_upp is not null then
    v_rend       := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
    v_disponivel := floor(round(greatest(v_rend, 0) / v_upp, 6));
  else
    v_disponivel := floor(greatest(coalesce(v_saldo, 0), 0));
  end if;
  if p_quantidade > v_disponivel then
    raise exception 'Estoque insuficiente: há % % de % nesta unidade.',
      trim_scale(v_disponivel), v_p.unit, v_p.name using errcode = 'P0001';
  end if;

  -- O custo do que sai: o dos lotes que o FEFO vai tirar (o custo da entrada
  -- de cada um), na proporção; sem lote com custo, o custo de consumo do cadastro.
  v_falta := p_quantidade;
  for v_l in
    select b.id, b.quantity,
           (select m.unit_cost from public.stock_movement_batches smb
              join public.stock_movements m on m.id = smb.movement_id
             where smb.batch_id = b.id and m.type = 'PURCHASE' and m.unit_cost is not null limit 1) as custo
      from public.product_batches b
     where b.product_id = p_produto and b.branch_id = p_unidade and b.quantity > 0
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

  insert into public.product_sales
    (tenant_id, branch_id, client_id, product_id, quantity, preco_unitario, preco_tabela, desconto, price,
     custo, sold_by, sold_at)
  values (p_tenant, p_unidade, p_cliente, p_produto, p_quantidade, v_unit, v_tabela, v_desconto, v_vendido,
          round(coalesce(v_custo_un, 0) * p_quantidade * v_fator, 2), p_ator, v_agora)
  returning id into v_venda;

  if v_upp is not null then
    v_novo_rend := v_rend - p_quantidade * v_upp;
    v_novas     := ceil(round(v_novo_rend / v_upp, 6));
  else
    v_novas     := coalesce(v_saldo, 0) - p_quantidade;
    v_novo_rend := null;
  end if;

  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference)
  values (p_unidade, p_produto, 'SALE', -(p_quantidade * v_fator), coalesce(v_novo_rend, v_novas), v_custo_un,
          'Venda — ' || v_cliente, coalesce(p_ator::text, 'sistema'), 'venda:' || v_venda)
  returning id into v_mov;

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  update public.product_sales set stock_movement_id = v_mov where id = v_venda;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) as x(j)
  loop
    insert into public.financial_transactions
      (branch_id, client_id, product_sale_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes)
    values (
      p_unidade, p_cliente, v_venda, 'INCOME', 'Venda de produto',
      'Venda de produto — ' || p_quantidade || '× ' || v_p.name || coalesce(' — ' || nullif(v_l.j ->> 'sufixo', ''), ''),
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
      nullif(v_l.j ->> 'cartao_vezes', '')::smallint
    );
  end loop;

  return v_venda;
end;
$function$;

revoke execute on function public.produto_vender(uuid, uuid, uuid, uuid, uuid, integer, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.produto_vender(uuid, uuid, uuid, uuid, uuid, integer, numeric, jsonb) to service_role;

-- 5 ---------------------------------------------------------------------------
create or replace function public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
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

  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
   where cp.purchased_at between p_from and p_to
     and (p_professional_id is null or cp.sold_by = p_professional_id)

  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to
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
  -- "quem vendeu" na coluna Profissional (o recorte do "só os meus").
  union all
  select ps.id, 'PRODUTO', ps.sold_at, p.name, ps.quantity,
         ps.client_id, c.name, u.name, ps.branch_id, ps.price
    from public.product_sales ps
    join scope s on s.id = ps.branch_id
    join public.products p on p.id = ps.product_id
    left join public.clients c on c.id = ps.client_id
    left join public.users u on u.id = ps.sold_by
   where ps.tenant_id = p_tenant
     and ps.sold_at between p_from and p_to
     and (p_professional_id is null or ps.sold_by = p_professional_id)
$function$;

notify pgrst, 'reload schema';
