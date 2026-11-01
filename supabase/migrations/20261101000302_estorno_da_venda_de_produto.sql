-- O ESTORNO DA VENDA DE PRODUTO (H2, decisão do Heitor, 2026-11-01): "estorno
-- de produto precisa ter um campo para indicar se houve devolução de produto
-- ou não; se sim, produto volta ao estoque".
--
-- Na 5ª simulação o protetor (R$ 98, custo R$ 45) foi vendido e estornado com
-- o motivo "Cliente devolveu o protetor, lacrado": o estoque ficou em 9 (não
-- voltou ao 10), o DRE ainda descontava os R$ 45 e Relatórios → Vendas contava
-- a venda (R$ 6.013 contra R$ 5.915). O estorno era só do LANÇAMENTO: a venda,
-- o estoque e o custo não sabiam dele.
--
-- Agora o estorno de um lançamento de venda de produto é o estorno da VENDA
-- INTEIRA, numa transação (`produto_estornar_venda`):
--   1. o dinheiro: cada lançamento PAGO dela passa por `estornar_transacao`
--      (contra-lançamento, pontos, crédito interno e comissão, como sempre);
--      o que estava A RECEBER (a parcela do crediário) sai marcado
--      'Estornada', sem contra-lançamento — não entrou dinheiro;
--   2. a comissão da venda: a linha é CANCELADA e acertada (o que ela liberou
--      volta);
--   3. o produto: "voltou" → um movimento SALE_RETURN devolve ao saldo o que
--      a venda tirou, e a cada LOTE o que saiu dele (`stock_movement_batches`
--      do movimento da venda); "não voltou" → o estoque fica, e a venda vira
--      PERDA (motivo 'VENDA_ESTORNADA' em `metrics_perdas`, pelo custo
--      retratado na venda) — fora do lucro, como toda perda (D-7);
--   4. a venda: `estornada_em`, quem, o motivo e se o produto voltou.
-- `estornar_transacao` passa a RECUSAR o lançamento de venda de produto
-- chamado sozinho: estornar só o dinheiro deixava a venda viva nas Vendas e no
-- custo, que é o defeito.
--
-- Vendas (`metrics_vendas`, e com ela o `_resumo`, a `_pagina` e o CSV) e o
-- custo do lucro (`metrics_resultado`, `metrics_series_do_resultado`) deixam
-- de contar a venda estornada.

alter table public.product_sales
  add column if not exists estornada_em          timestamptz,
  add column if not exists estornada_por         text,
  add column if not exists estorno_motivo        text check (estorno_motivo is null or char_length(estorno_motivo) <= 500),
  add column if not exists produto_voltou        boolean,
  add column if not exists devolucao_movement_id uuid references public.stock_movements(id) on delete set null;

alter table public.product_sales
  drop constraint if exists product_sales_estorno_coerente;
alter table public.product_sales
  add constraint product_sales_estorno_coerente check ((estornada_em is null) = (produto_voltou is null));

-- ---------------------------------------------------------------------------
-- estornar_transacao: o corpo é o da produção (pg_get_functiondef, 2026-11-01),
-- com a trava do lançamento de venda de produto logo depois da rede.
create or replace function public.estornar_transacao(p_transacao uuid, p_tenant uuid, p_ator text, p_motivo text default null::text)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_tx      public.financial_transactions%rowtype;
  v_tenant  uuid;
  v_novo_id uuid;
  v_ganho   public.loyalty_transactions%rowtype;
  v_resgate public.loyalty_transactions%rowtype;
  v_meses   int;
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  select t.* into v_tx
  from public.financial_transactions t
  where t.id = p_transacao
  for update;

  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'no_data_found';
  end if;

  select b.tenant_id into v_tenant
  from public.branches b where b.id = v_tx.branch_id;

  if v_tenant is distinct from p_tenant then
    raise exception 'Lançamento não encontrado.' using errcode = 'no_data_found';
  end if;

  -- O lançamento de uma venda de produto só se estorna com a VENDA
  -- (produto_estornar_venda, que diz se o produto voltou): sozinho, o
  -- dinheiro voltava e a venda seguia nas Vendas, no custo e fora do estoque.
  if v_tx.product_sale_id is not null
     and coalesce(current_setting('bellaris.estorno_da_venda', true), '') <> v_tx.product_sale_id::text then
    raise exception 'Este lançamento é de uma venda de produto: estorne a venda, dizendo se o produto voltou ao estoque.' using errcode = 'P0001';
  end if;

  if v_tx.notes = 'Estornada' then
    raise exception 'Este lançamento já foi estornado.' using errcode = 'invalid_parameter_value';
  end if;

  if v_tx.category = 'Estorno' then
    raise exception 'Um estorno não se estorna — para desfazer, fale com o financeiro.' using errcode = 'invalid_parameter_value';
  end if;

  if not v_tx.is_paid then
    raise exception 'Lançamento ainda não pago: não há o que estornar.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.financial_transactions (
    branch_id, client_id, appointment_id, treatment_plan_id,
    type, category, description, amount,
    payment_method, cartao_vezes, estorno_motivo,
    is_paid, paid_at, created_by
  ) values (
    v_tx.branch_id, v_tx.client_id, null, v_tx.treatment_plan_id,
    case when v_tx.type = 'INCOME' then 'EXPENSE' else 'INCOME' end::public."TransactionType",
    'Estorno',
    'Estorno: ' || v_tx.description,
    v_tx.amount,
    v_tx.payment_method, v_tx.cartao_vezes, v_motivo,
    true, now(), p_ator
  )
  returning id into v_novo_id;

  update public.financial_transactions
     set notes = 'Estornada', estorno_motivo = v_motivo, updated_at = now()
   where id = p_transacao;

  if v_tx.payment_method = 'INTERNAL_CREDIT' and v_tx.type = 'INCOME' and v_tx.client_id is not null then
    insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
    values (v_tx.client_id, v_tx.branch_id, v_tx.amount, 'Estorno: ' || v_tx.description, v_novo_id);
  end if;

  if v_tx.type = 'INCOME' and v_tx.client_id is not null then
    select l.* into v_ganho
      from public.loyalty_transactions l
     where l.transaction_id = p_transacao and l.kind = 'GANHO';
    select l.* into v_resgate
      from public.loyalty_transactions l
     where l.transaction_id = p_transacao and l.kind = 'RESGATE';

    if v_ganho.id is not null or v_resgate.id is not null
       or exists (select 1 from public.loyalty_vouchers v where v.used_transaction_id = p_transacao) then
      perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_tx.client_id::text));
    end if;

    if v_ganho.id is not null then
      insert into public.loyalty_transactions (
        loyalty_account_id, branch_id, kind, points, description,
        transaction_id, appointment_id, treatment_plan_id, expires_at, created_by
      ) values (
        v_ganho.loyalty_account_id, v_ganho.branch_id, 'ESTORNO_GANHO', -v_ganho.points,
        'Estorno: ' || v_tx.description,
        v_novo_id, v_ganho.appointment_id, v_ganho.treatment_plan_id, v_ganho.expires_at, p_ator
      );
    end if;

    if v_resgate.id is not null then
      select c.expiry_months into v_meses from public.loyalty_configs c where c.tenant_id = p_tenant;
      insert into public.loyalty_transactions (
        loyalty_account_id, branch_id, kind, points, description,
        transaction_id, appointment_id, expires_at, created_by
      ) values (
        v_resgate.loyalty_account_id, v_resgate.branch_id, 'ESTORNO_RESGATE', -v_resgate.points,
        'Estorno: ' || v_tx.description,
        v_novo_id, v_resgate.appointment_id,
        case when v_meses is null then null else now() + make_interval(months => v_meses) end,
        p_ator
      );
    end if;

    update public.loyalty_vouchers
       set status = 'ATIVO', used_at = null, used_transaction_id = null
     where used_transaction_id = p_transacao and status = 'USADO';
  end if;

  return v_novo_id;
end;
$function$;

-- ---------------------------------------------------------------------------
create or replace function public.produto_estornar_venda(
  p_tenant uuid, p_venda uuid, p_ator text, p_motivo text, p_voltou boolean
)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  select * into v_p from public.products p where p.id = v_v.product_id;
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
  --    venda o tirou. Não voltou: o estoque fica — é perda (metrics_perdas).
  if p_voltou then
    select * into v_mov from public.stock_movements m where m.id = v_v.stock_movement_id;
    v_qtd := case when v_mov.id is not null then -v_mov.quantity
                  else v_v.quantity * public.fator_de_consumo(v_p) end;
    v_upp := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
    select s.current_stock, s.current_rendimento into v_saldo, v_rend
      from public.branch_product_stock s
     where s.product_id = v_v.product_id and s.branch_id = v_v.branch_id
     for update;
    if not found then
      raise exception 'Não achei o estoque deste produto na unidade.' using errcode = 'no_data_found';
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
    values (v_v.branch_id, v_v.product_id, 'SALE_RETURN', v_qtd, coalesce(v_novo_rend, v_novas), v_mov.unit_cost,
            'Devolução — estorno da venda — ' || coalesce(v_cliente, 'cliente'), coalesce(p_ator, 'sistema'), 'venda:' || p_venda)
    returning id into v_dev;

    update public.branch_product_stock
       set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
     where product_id = v_v.product_id and branch_id = v_v.branch_id;

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
  end if;

  -- 4. A venda.
  update public.product_sales
     set estornada_em = now(), estornada_por = p_ator, estorno_motivo = v_motivo,
         produto_voltou = p_voltou, devolucao_movement_id = v_dev
   where id = p_venda;

  return p_venda;
end
$function$;

revoke all on function public.produto_estornar_venda(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.produto_estornar_venda(uuid, uuid, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- metrics_vendas: o corpo da produção, com a venda de produto ESTORNADA fora.
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
  -- "quem vendeu" na coluna Profissional (o recorte do "só os meus"). A
  -- ESTORNADA não é venda (H2, 2026-11-01).
  union all
  select ps.id, 'PRODUTO', ps.sold_at, p.name, ps.quantity,
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

-- ---------------------------------------------------------------------------
-- O custo do lucro sem a venda estornada (o corpo da produção + a condição).
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
    select v.branch_id, 0::numeric, v.custo
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
    select date_trunc((select g from gran), v.sold_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, v.custo
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

-- ---------------------------------------------------------------------------
-- As perdas: os movimentos LOSS (como antes) e a venda estornada cujo produto
-- NÃO voltou (motivo 'VENDA_ESTORNADA', no dia do estorno, pelo custo
-- retratado na venda; a quantidade na unidade do movimento e em embalagens).
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
    select 'VENDA_ESTORNADA', v.product_id,
           v.quantity * public.fator_de_consumo(p),
           v.quantity::numeric,
           v.custo
      from public.product_sales v
      join public.branches b on b.id = v.branch_id and b.tenant_id = p_tenant
      left join public.products p on p.id = v.product_id
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

notify pgrst, 'reload schema';
