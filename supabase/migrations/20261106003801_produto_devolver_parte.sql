-- A34 da 8ª simulação (2026-11-06): a devolução de UMA unidade do produto.
--
-- Não existia: a Marta estornou a venda inteira da Karina e vendeu de novo o
-- que ficou, em três lançamentos. Decidido pelo princípio 3 do CLAUDE.md ("o
-- que a tela mostra é o que vale na conta"): a devolução é POR LINHA — o
-- estoque e o dinheiro proporcionais ao que voltou. No cartão vale a regra do
-- estorno inteiro (r2-fin-03): o pagamento todo volta e o que fica é lançado
-- de novo, na forma que a recepção escolher (a original vem escolhida, A41).
--
-- O desenho é o do cancelamento da unidade do pré-pago (D1 da 6ª,
-- `procedimento_cancelar_unidade_devolvendo`): a venda passa a valer o vendido
-- menos o devolvido; o a receber que passa disso cai ANTES; o pago além disso
-- volta como a recepção escolher — estorno (parcial, ou no cartão o inteiro e
-- o que fica lançado de novo) ou crédito na clínica. A comissão de venda se
-- acerta pelo que a venda passou a valer; as Vendas, o custo do lucro e as
-- perdas também (migration 003802).

-- 1. O que já voltou, por item e na venda.
alter table public.product_sale_items
  add column if not exists devolvidas     integer not null default 0,
  add column if not exists valor_devolvido numeric not null default 0,
  add column if not exists custo_devolvido numeric not null default 0;
alter table public.product_sales
  add column if not exists valor_devolvido     numeric not null default 0,
  add column if not exists custo_devolvido     numeric not null default 0,
  add column if not exists unidades_devolvidas integer not null default 0;

comment on column public.product_sale_items.devolvidas is
  'Unidades deste item devolvidas em parte (produto_devolver_itens, A34 da 8ª); o resto ainda está com a cliente.';
comment on column public.product_sales.valor_devolvido is
  'O que a devolução em parte tirou do vendido (A34 da 8ª): a venda vale price − valor_devolvido.';

-- 2. Cada devolução, com o retrato da conta. Só o servidor lê e grava (RLS
--    sem política permissiva). `item_id` e `movement_id` sem chave
--    estrangeira de propósito: a tabela não pode virar "junção" no PostgREST.
create table if not exists public.product_sale_returns (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id),
  sale_id         uuid not null references public.product_sales(id),
  item_id         uuid not null,
  quantidade      integer not null check (quantidade > 0),
  valor           numeric not null,
  custo           numeric not null,
  voltou          boolean not null,
  movement_id     uuid,
  motivo          text not null,
  retrato         jsonb,
  created_by      text,
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists product_sale_returns_sale on public.product_sale_returns (sale_id);
create index if not exists product_sale_returns_tenant_dia on public.product_sale_returns (tenant_id, created_at);

alter table public.product_sale_returns enable row level security;
create policy suporte_sem_escrita_ins on public.product_sale_returns as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.product_sale_returns as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end) with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.product_sale_returns as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- 3. Devolver aos lotes de onde a venda tirou: o que cada lote deu menos o
--    que as devoluções de antes já puseram de volta nele, até `p_qtd`.
create or replace function private.devolver_aos_lotes(p_mov_venda uuid, p_mov_dev uuid, p_anteriores uuid[], p_qtd numeric)
returns void
language plpgsql
set search_path to ''
as $$
declare
  v_l     record;
  v_falta numeric := p_qtd;
  v_poe   numeric;
begin
  for v_l in
    select smb.batch_id,
           smb.quantity - coalesce((select sum(x.quantity) from public.stock_movement_batches x
                                     where x.batch_id = smb.batch_id and x.movement_id = any (coalesce(p_anteriores, '{}'::uuid[]))), 0) as cabe
      from public.stock_movement_batches smb
      join public.product_batches b on b.id = smb.batch_id
     where smb.movement_id = p_mov_venda
     order by b.expires_at desc nulls first, b.received_at desc
  loop
    exit when v_falta <= 0;
    continue when v_l.cabe <= 0;
    v_poe := least(v_l.cabe, v_falta);
    update public.product_batches set quantity = quantity + v_poe where id = v_l.batch_id;
    insert into public.stock_movement_batches (movement_id, batch_id, quantity) values (p_mov_dev, v_l.batch_id, v_poe);
    v_falta := v_falta - v_poe;
  end loop;
end $$;

-- 4. A devolução em parte. `p_itens` = [{ "item": uuid, "quantidade": int }].
--    `p_simular` devolve a conta sem gravar (a janela a mostra); confirmar
--    manda o "a devolver" que ela mostrou (`p_esperado`).
create or replace function public.produto_devolver_itens(
  p_tenant uuid, p_venda uuid, p_ator uuid, p_ator_nome text, p_motivo text, p_itens jsonb, p_voltou boolean,
  p_destino text, p_esperado numeric, p_simular boolean, p_estorno text, p_novo jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_v           public.product_sales%rowtype;
  v_p           public.products%rowtype;
  v_mov         public.stock_movements%rowtype;
  v_cliente     text;
  v_motivo      text := nullif(trim(coalesce(p_motivo, '')), '');
  v_ator        text := coalesce(p_ator::text, 'sistema');
  v_it          record;
  v_q           integer;
  v_valor_q     numeric;
  v_custo_q     numeric;
  v_lista       jsonb := '[]'::jsonb;
  v_valor_dev   numeric := 0;
  v_custo_dev   numeric := 0;
  v_qtd_dev     integer := 0;
  v_restam      integer;
  v_valor       numeric;
  v_pago        numeric;
  v_aberto      numeric;
  v_cortar      numeric;
  v_cortado     numeric := 0;
  v_devolver    numeric;
  v_resto       numeric;
  v_corte       numeric;
  v_parcelas    jsonb := '[]'::jsonb;
  v_tx          record;
  v_contra      uuid;
  v_ganho       public.loyalty_transactions%rowtype;
  v_pts         int;
  v_linha       uuid;
  v_fid         boolean;
  v_destino     text := nullif(upper(trim(coalesce(p_destino, ''))), '');
  v_resultado   jsonb;
  v_parcial     jsonb;
  v_estorno     text := nullif(upper(trim(coalesce(p_estorno, ''))), '');
  v_novo_metodo text := nullif(upper(trim(coalesce(p_novo ->> 'metodo', ''))), '');
  v_novo_vezes  int  := coalesce(nullif(p_novo ->> 'vezes', '')::int, 1);
  v_fica        numeric;
  v_qtd_cons    numeric;
  v_upp         numeric;
  v_saldo       numeric;
  v_rend        numeric;
  v_novo_rend   numeric;
  v_novas       numeric;
  v_dev         uuid;
  v_descricao   text;
begin
  if p_simular then
    select * into v_v from public.product_sales s where s.id = p_venda;
  else
    select * into v_v from public.product_sales s where s.id = p_venda for update;
  end if;
  if not found or v_v.tenant_id is distinct from p_tenant then
    raise exception 'Venda não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_v.estornada_em is not null then
    raise exception 'Esta venda já foi estornada.' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.product_sale_items i where i.sale_id = p_venda) then
    raise exception 'Esta venda é de antes da devolução por produto: estorne a venda inteira.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'Diga quantas unidades de cada produto voltam.' using errcode = 'P0001';
  end if;
  select c.name into v_cliente from public.clients c where c.id = v_v.client_id;

  -- A parte de cada item no vendido (a mesma conta da venda: o desconto
  -- rateado pela tabela, a última parte com o arredondamento).
  for v_it in
    with base as (
      select i.*, case when coalesce(v_v.preco_tabela, 0) > 0
                       then round(i.preco_tabela * v_v.price / v_v.preco_tabela, 2) else 0 end as r
        from public.product_sale_items i where i.sale_id = p_venda
    )
    select b.*, p.name as produto,
           case when b.sort_order = max(b.sort_order) over () then v_v.price - (sum(b.r) over () - b.r) else b.r end as parte,
           coalesce((select (x ->> 'quantidade')::int from jsonb_array_elements(p_itens) x
                      where (x ->> 'item') = b.id::text limit 1), 0) as pedido
      from base b join public.products p on p.id = b.product_id
     order by b.sort_order
  loop
    v_q := v_it.pedido;
    continue when v_q is null or v_q = 0;
    if v_q < 0 or v_q > v_it.quantity - v_it.devolvidas then
      raise exception 'De %, voltam até % unidade(s).', v_it.produto, v_it.quantity - v_it.devolvidas using errcode = 'P0001';
    end if;
    if v_q = v_it.quantity - v_it.devolvidas then
      v_valor_q := round(v_it.parte - v_it.valor_devolvido, 2);
      v_custo_q := round(v_it.custo - v_it.custo_devolvido, 2);
    else
      v_valor_q := round(v_it.parte * v_q / v_it.quantity, 2);
      v_custo_q := round(v_it.custo * v_q / v_it.quantity, 2);
    end if;
    v_valor_dev := v_valor_dev + v_valor_q;
    v_custo_dev := v_custo_dev + v_custo_q;
    v_qtd_dev   := v_qtd_dev + v_q;
    v_lista := v_lista || jsonb_build_object('item', v_it.id, 'produto', v_it.produto, 'quantidade', v_q,
                                             'de', v_it.quantity, 'valor', v_valor_q, 'custo', v_custo_q);
  end loop;
  if v_qtd_dev = 0 then
    raise exception 'Diga quantas unidades voltam.' using errcode = 'P0001';
  end if;
  select coalesce(sum(i.quantity - i.devolvidas), 0) into v_restam from public.product_sale_items i where i.sale_id = p_venda;
  if v_restam - v_qtd_dev <= 0 then
    raise exception 'É a venda inteira: estorne a venda (“Confirmar estorno”).' using errcode = 'P0001';
  end if;

  v_valor := greatest(round(v_v.price - v_v.valor_devolvido - v_valor_dev, 2), 0);

  -- O dinheiro da venda, vivo (sem o estornado nem o estorno).
  select coalesce(sum(f.amount) filter (where f.is_paid), 0),
         coalesce(sum(f.amount) filter (where not f.is_paid), 0)
    into v_pago, v_aberto
    from public.financial_transactions f
   where f.product_sale_id = v_v.id and f.type = 'INCOME'
     and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno';
  v_cortar   := least(v_aberto, greatest(0, round(v_pago + v_aberto - v_valor, 2)));
  v_devolver := greatest(0, round(v_pago - v_valor, 2));

  select coalesce(c.enabled, false) into v_fid from public.loyalty_configs c where c.tenant_id = p_tenant;

  v_resto := v_cortar;
  for v_tx in
    select f.id, f.amount, f.description, f.due_date
      from public.financial_transactions f
     where f.product_sale_id = v_v.id and f.type = 'INCOME' and not f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
     order by f.due_date desc nulls first, f.parcela_numero desc nulls last, f.created_at desc, f.id desc
  loop
    exit when v_resto <= 0;
    v_corte := least(v_resto, v_tx.amount);
    v_parcelas := v_parcelas || jsonb_build_object('id', v_tx.id, 'descricao', v_tx.description, 'vencimento', v_tx.due_date,
                                                   'valor', v_tx.amount, 'cai', v_corte, 'fica', v_tx.amount - v_corte);
    v_resto := v_resto - v_corte;
  end loop;

  if v_devolver > 0 then
    v_resto := v_devolver;
    for v_tx in
      select f.id, f.amount, f.description, f.payment_method, f.cartao_vezes, f.cartao_bandeira
        from public.financial_transactions f
       where f.product_sale_id = v_v.id and f.type = 'INCOME' and f.is_paid
         and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
       order by coalesce(f.paid_at, f.created_at) desc, f.created_at desc, f.id desc
    loop
      exit when v_resto <= 0;
      if v_tx.amount <= v_resto then
        v_resto := round(v_resto - v_tx.amount, 2);
      else
        v_parcial := jsonb_build_object(
          'id', v_tx.id, 'descricao', v_tx.description, 'metodo', v_tx.payment_method::text,
          'vezes', v_tx.cartao_vezes, 'bandeira', v_tx.cartao_bandeira, 'valor', v_tx.amount, 'volta', v_resto,
          'fica', round(v_tx.amount - v_resto, 2),
          'cartao', coalesce(v_tx.payment_method::text in ('CREDIT_CARD', 'DEBIT_CARD'), false));
        v_resto := 0;
      end if;
    end loop;
  end if;

  select string_agg((x ->> 'quantidade') || '× ' || (x ->> 'produto'), ' + ') into v_descricao
    from jsonb_array_elements(v_lista) x;

  v_resultado := jsonb_build_object(
    'descricao', coalesce(v_v.descricao, v_descricao), 'itens', v_lista, 'devolvido', v_descricao,
    'valor_devolvido', v_valor_dev, 'custo_devolvido', v_custo_dev, 'unidades', v_qtd_dev,
    'vendido', v_v.price, 'devolvido_antes', v_v.valor_devolvido, 'valor_novo', v_valor,
    'pago', v_pago, 'a_receber', v_aberto, 'parcelas', v_parcelas, 'cai', v_cortar,
    'devolver', v_devolver, 'fidelidade', coalesce(v_fid, false), 'parcial', v_parcial);

  if p_simular then
    return v_resultado;
  end if;

  if v_motivo is null then
    raise exception 'Diga o motivo da devolução.' using errcode = 'P0001';
  end if;
  if p_voltou is null then
    raise exception 'Diga se o produto voltou ao estoque.' using errcode = 'P0001';
  end if;
  if round(coalesce(p_esperado, -1), 2) <> v_devolver then
    raise exception 'Os valores da venda mudaram desde que a janela abriu: feche e abra de novo.' using errcode = 'P0001';
  end if;
  if v_devolver > 0 and v_destino is distinct from 'ESTORNO' and v_destino is distinct from 'CREDITO' then
    raise exception 'Diga como devolver o que a cliente pagou além do que a venda vale: estorno ou crédito na clínica.' using errcode = 'P0001';
  end if;
  if v_destino = 'ESTORNO' and v_parcial is not null then
    if v_estorno is null and not (v_parcial ->> 'cartao')::boolean then
      v_estorno := 'PARCIAL';
    end if;
    if (v_parcial ->> 'cartao')::boolean and v_estorno is distinct from 'INTEIRO' then
      raise exception 'No cartão, o estorno é do pagamento inteiro: estorne o pagamento inteiro e lance o que fica de novo.' using errcode = 'P0001';
    end if;
    if v_estorno is distinct from 'PARCIAL' and v_estorno is distinct from 'INTEIRO' then
      raise exception 'Diga como estornar o pagamento: estorno parcial ou o pagamento inteiro com o que fica lançado de novo.' using errcode = 'P0001';
    end if;
    if v_estorno = 'INTEIRO' then
      if v_novo_metodo is null or v_novo_metodo not in ('CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD') then
        raise exception 'Diga a forma do pagamento do que fica.' using errcode = 'P0001';
      end if;
      if v_novo_vezes < 1 or v_novo_vezes > 12 or (v_novo_metodo <> 'CREDIT_CARD' and v_novo_vezes <> 1) then
        raise exception 'As vezes no cartão vão de 1 a 12, só no crédito.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- 1. Cada item: o que voltou, o estoque (se voltou) e o registro.
  for v_it in
    select x ->> 'item' as item, (x ->> 'quantidade')::int as q, (x ->> 'valor')::numeric as valor, (x ->> 'custo')::numeric as custo
      from jsonb_array_elements(v_lista) x
  loop
    select i.* into v_tx from public.product_sale_items i where i.id = v_it.item::uuid for update;
    v_dev := null;
    if p_voltou then
      select * into v_p from public.products p where p.id = v_tx.product_id;
      v_mov := null;
      select * into v_mov from public.stock_movements m where m.id = v_tx.stock_movement_id;
      v_qtd_cons := v_it.q * public.fator_de_consumo(v_p);
      v_upp := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
      select s.current_stock, s.current_rendimento into v_saldo, v_rend
        from public.branch_product_stock s
       where s.product_id = v_tx.product_id and s.branch_id = v_v.branch_id
       for update;
      if not found then
        raise exception 'Não achei o estoque de % na unidade.', v_p.name using errcode = 'no_data_found';
      end if;
      if v_upp is not null then
        v_rend      := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
        v_novo_rend := v_rend + v_qtd_cons;
        v_novas     := ceil(round(v_novo_rend / v_upp, 6));
      else
        v_novas     := coalesce(v_saldo, 0) + v_qtd_cons;
        v_novo_rend := null;
      end if;
      insert into public.stock_movements
        (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference)
      values (v_v.branch_id, v_tx.product_id, 'SALE_RETURN', v_qtd_cons, coalesce(v_novo_rend, v_novas), v_mov.unit_cost,
              'Devolução de parte da venda — ' || coalesce(v_cliente, 'cliente'), v_ator, 'venda:' || p_venda)
      returning id into v_dev;
      update public.branch_product_stock
         set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
       where product_id = v_tx.product_id and branch_id = v_v.branch_id;
      if v_mov.id is not null then
        perform private.devolver_aos_lotes(v_mov.id, v_dev,
          array(select r.movement_id from public.product_sale_returns r where r.item_id = v_tx.id and r.movement_id is not null),
          v_qtd_cons);
      end if;
    end if;
    update public.product_sale_items
       set devolvidas = devolvidas + v_it.q, valor_devolvido = valor_devolvido + v_it.valor, custo_devolvido = custo_devolvido + v_it.custo
     where id = v_tx.id;
    insert into public.product_sale_returns
      (tenant_id, sale_id, item_id, quantidade, valor, custo, voltou, movement_id, motivo, retrato, created_by, created_by_name)
    values (p_tenant, p_venda, v_tx.id, v_it.q, v_it.valor, v_it.custo, p_voltou, v_dev, v_motivo,
            v_resultado || jsonb_build_object('destino', case when v_devolver > 0 then v_destino end,
                                              'estorno', case when v_destino = 'ESTORNO' and v_parcial is not null then v_estorno end,
                                              'novo', case when v_estorno = 'INTEIRO' then jsonb_build_object('metodo', v_novo_metodo, 'vezes', v_novo_vezes) end),
            v_ator, p_ator_nome);
  end loop;

  update public.product_sales
     set valor_devolvido = valor_devolvido + v_valor_dev, custo_devolvido = custo_devolvido + v_custo_dev,
         unidades_devolvidas = unidades_devolvidas + v_qtd_dev
   where id = p_venda;

  -- 2. O crediário que passa do novo valor cai.
  for v_tx in
    select f.id, f.amount
      from public.financial_transactions f
     where f.product_sale_id = v_v.id and f.type = 'INCOME' and not f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
     order by f.due_date desc nulls first, f.parcela_numero desc nulls last, f.created_at desc, f.id desc
     for update
  loop
    exit when v_cortado >= v_cortar;
    v_corte := least(v_cortar - v_cortado, v_tx.amount);
    if v_corte >= v_tx.amount then
      update public.financial_transactions
         set notes = 'Estornada', estorno_motivo = 'Devolução de parte da venda: ' || v_motivo, updated_at = now()
       where id = v_tx.id;
    else
      update public.financial_transactions set amount = amount - v_corte, updated_at = now() where id = v_tx.id;
    end if;
    v_cortado := v_cortado + v_corte;
  end loop;

  -- 3. O pago além do novo valor volta (a marca deixa estornar_transacao
  --    passar só para ESTA venda, como em produto_estornar_venda).
  if v_devolver > 0 and v_destino = 'CREDITO' then
    insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
    values (v_v.client_id, v_v.branch_id, v_devolver, 'Devolução de ' || v_descricao, null);
  elsif v_devolver > 0 then
    perform set_config('bellaris.estorno_da_venda', p_venda::text, true);
    v_resto := v_devolver;
    for v_tx in
      select f.*
        from public.financial_transactions f
       where f.product_sale_id = v_v.id and f.type = 'INCOME' and f.is_paid
         and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
       order by coalesce(f.paid_at, f.created_at) desc, f.created_at desc, f.id desc
       for update
    loop
      exit when v_resto <= 0;
      if v_tx.amount <= v_resto then
        perform public.estornar_transacao(v_tx.id, p_tenant, v_ator, v_motivo);
        v_resto := round(v_resto - v_tx.amount, 2);
      elsif v_estorno = 'INTEIRO' then
        v_fica := round(v_tx.amount - v_resto, 2);
        perform public.estornar_transacao(v_tx.id, p_tenant, v_ator, v_motivo);
        insert into public.financial_transactions (
          branch_id, client_id, product_sale_id, type, category, description, amount,
          payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by
        ) values (
          v_tx.branch_id, v_tx.client_id, v_v.id, 'INCOME', v_tx.category,
          v_tx.description || ' — o que fica, lançado de novo na devolução', v_fica,
          v_novo_metodo::public."PaymentMethod",
          case when v_novo_metodo = 'CREDIT_CARD' and v_novo_vezes >= 2 then v_novo_vezes end,
          private.bandeira_do_cartao(v_novo_metodo, p_novo ->> 'bandeira'),
          true, now(), v_ator
        );
        v_resto := 0;
      else
        update public.financial_transactions
           set amount = round(amount - v_resto, 2), updated_at = now()
         where id = v_tx.id;
        insert into public.financial_transactions (
          branch_id, client_id, appointment_id, treatment_plan_id,
          type, category, description, amount,
          payment_method, cartao_vezes, estorno_motivo,
          is_paid, paid_at, created_by
        ) values (
          v_tx.branch_id, v_tx.client_id, null, null,
          'EXPENSE', 'Estorno', 'Estorno parcial: ' || v_tx.description, v_resto,
          v_tx.payment_method, v_tx.cartao_vezes, v_motivo,
          true, now(), v_ator
        ) returning id into v_contra;
        if v_tx.payment_method = 'INTERNAL_CREDIT' and v_tx.client_id is not null then
          insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
          values (v_tx.client_id, v_tx.branch_id, v_resto, 'Estorno parcial: ' || v_tx.description, v_contra);
        end if;
        if v_tx.client_id is not null then
          select l.* into v_ganho from public.loyalty_transactions l
           where l.transaction_id = v_tx.id and l.kind = 'GANHO';
          if v_ganho.id is not null then
            perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_tx.client_id::text));
            v_pts := round(v_ganho.points * v_resto / v_tx.amount);
            if v_pts > 0 then
              insert into public.loyalty_transactions (
                loyalty_account_id, branch_id, kind, points, description,
                transaction_id, appointment_id, treatment_plan_id, expires_at, created_by
              ) values (
                v_ganho.loyalty_account_id, v_ganho.branch_id, 'ESTORNO_GANHO', -v_pts,
                'Estorno parcial: ' || v_tx.description,
                v_contra, v_ganho.appointment_id, v_ganho.treatment_plan_id, v_ganho.expires_at, v_ator
              );
            end if;
          end if;
        end if;
        v_resto := 0;
      end if;
    end loop;
    perform set_config('bellaris.estorno_da_venda', '', true);
  end if;

  -- 4. A comissão da venda, pelo que ela passou a valer (idempotente).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.product_sale_id = p_venda and cl.status <> 'CANCELADA'
     order by cl.created_at
  loop
    perform private.comissao_acertar_linha(v_linha, 'Devolução de parte da venda de produto', null);
  end loop;

  return v_resultado || jsonb_build_object(
    'destino', case when v_devolver > 0 then v_destino end,
    'estorno', case when v_destino = 'ESTORNO' and v_parcial is not null then v_estorno end,
    'reduzido', v_cortado);
end $function$;

revoke execute on function public.produto_devolver_itens(uuid, uuid, uuid, text, text, jsonb, boolean, text, numeric, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.produto_devolver_itens(uuid, uuid, uuid, text, text, jsonb, boolean, text, numeric, boolean, text, jsonb) to service_role;
revoke execute on function private.devolver_aos_lotes(uuid, uuid, uuid[], numeric) from public, anon, authenticated;

-- 5. O estorno da venda INTEIRA depois de uma devolução em parte devolve só o
--    que ainda estava com a cliente (o item já devolvido não volta de novo), e
--    aos lotes que ainda não o receberam de volta.
create or replace function public.produto_estornar_venda(p_tenant uuid, p_venda uuid, p_ator text, p_motivo text, p_voltou boolean)
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
  --    venda o tirou — cada item (na ordem do produto), sem o que a devolução
  --    em parte já levou (A34); a venda de antes, o do cabeçalho. Não voltou:
  --    o estoque fica — é perda (metrics_perdas).
  if p_voltou then
    for v_item in
      select i.id, i.product_id, i.quantity, i.devolvidas, i.stock_movement_id
        from public.product_sale_items i where i.sale_id = p_venda and i.quantity > i.devolvidas
      union all
      select null::uuid, v_v.product_id, v_v.quantity, 0, v_v.stock_movement_id
       where not exists (select 1 from public.product_sale_items i where i.sale_id = p_venda)
      order by 2
    loop
      select * into v_p from public.products p where p.id = v_item.product_id;
      v_mov := null;
      select * into v_mov from public.stock_movements m where m.id = v_item.stock_movement_id;
      v_qtd := case when v_mov.id is not null and v_item.devolvidas = 0 then -v_mov.quantity
                    else (v_item.quantity - v_item.devolvidas) * public.fator_de_consumo(v_p) end;
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

      if v_mov.id is not null and v_item.devolvidas = 0 then
        update public.product_batches b
           set quantity = b.quantity + smb.quantity
          from public.stock_movement_batches smb
         where smb.movement_id = v_mov.id and smb.batch_id = b.id;
        insert into public.stock_movement_batches (movement_id, batch_id, quantity)
        select v_dev, smb.batch_id, smb.quantity
          from public.stock_movement_batches smb
         where smb.movement_id = v_mov.id;
      elsif v_mov.id is not null then
        perform private.devolver_aos_lotes(v_mov.id, v_dev,
          array(select r.movement_id from public.product_sale_returns r where r.item_id = v_item.id and r.movement_id is not null),
          v_qtd);
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

-- 6. A comissão da venda de produto vale o que a venda passou a valer: a
--    quitação compara o recebido com o vendido MENOS o devolvido, e a linha
--    (a do total, ou a de cada item) cai na proporção do que voltou.
create or replace function private.comissao_conta(p_linha uuid, OUT alvo numeric, OUT previsto numeric, OUT quitado boolean)
 returns record
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_l         public.commission_lines%rowtype;
  v_fracao    numeric := 1;
  v_desconto  numeric := 0;
  v_taxa      numeric := 0;
  v_base      numeric;
  v_valor     numeric;
  v_pago      boolean := false;
  v_estornado boolean := false;
  v_metodo    text;
  v_vezes     int;
  v_bandeira  text;
  v_total     numeric;
  v_recebido  numeric;
  v_quitado   numeric;
  v_dvenda    numeric := 0;
  v_fica      numeric;
begin
  alvo := 0; previsto := 0; quitado := false;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return;
  end if;
  quitado := true;

  if v_l.origem = 'AVULSO' then
    select f.is_paid and coalesce(f.notes, '') <> 'Estornada',
           coalesce(f.notes, '') = 'Estornada',
           coalesce(f.loyalty_discount, 0),
           f.payment_method::text,
           coalesce(f.sale_discount, 0),
           f.cartao_vezes,
           f.cartao_bandeira
      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes, v_bandeira
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME'
     order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
     limit 1;
    v_pago      := coalesce(v_pago, false);
    v_estornado := coalesce(v_estornado, false);
    if v_pago then
      v_taxa := private.comissao_taxa_pct(v_l.tenant_id, v_metodo, coalesce(v_vezes, 1), v_bandeira);
    else
      v_desconto := 0;
      v_dvenda   := 0;
    end if;
    v_dvenda := coalesce(v_dvenda, 0);
    quitado  := v_pago;
    v_fracao := case
      when v_l.modo in ('PAGAMENTO', 'INTEGRAL') then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    -- PAGAMENTO era sempre "sobre o pago"; INTEGRAL e ATENDIMENTO seguem a
    -- base com pontos da configuração (retratada na linha).
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and v_l.client_package_id is not null)
        or (v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null)
        or (v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null) then
    if v_l.origem = 'PLANO' then
      select coalesce(sum(p.price), 0) into v_total
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
       where s.plan_id = v_l.treatment_plan_id;
    elsif v_l.origem in ('PACOTE', 'PACOTE_VENDA') then
      -- O pacote cancelado vale o que foi usado (F2b): o preço vendido menos
      -- as sessões canceladas.
      select cp.price - coalesce(cp.valor_cancelado, 0) into v_total
        from public.client_packages cp where cp.id = v_l.client_package_id;
    elsif v_l.origem = 'PRODUTO' then
      -- A devolução em parte (A34 da 8ª): a venda vale o vendido menos o devolvido.
      select ps.price - coalesce(ps.valor_devolvido, 0) into v_total from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0)
        into v_total
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;
    select coalesce(sum(f.amount), 0),
           -- Pontos são forma de pagamento: quitam como o dinheiro.
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0)), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1), f.cartao_bandeira))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_quitado, v_taxa
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id)
         or (v_l.origem = 'PRODUTO' and f.product_sale_id = v_l.product_sale_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    -- Sem preço de venda (o pacote de antes da venda no sistema): libera na conclusão, como sempre.
    quitado := v_total is null or v_total <= 0 or round(v_quitado, 2) >= round(v_total, 2);
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    elsif v_l.modo = 'INTEGRAL' then
      v_fracao := case when quitado then 1 else 0 end;
    end if;

  else
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
  else
    v_base := v_l.preco - least(v_desconto + v_dvenda, v_l.preco);
    if v_l.desconta_taxa then
      v_base := v_base - round(v_base * v_taxa / 100, 2);
    end if;
    if v_l.desconta_insumos then
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_valor := round(greatest(v_base, 0) * v_l.regra_valor / 100, 2);
  end if;

  -- A comissão de VENDA do pacote cancelado volta na proporção do que foi
  -- cancelado (F2b) — o previsto também, para não liberar sobre o que caiu.
  if v_l.origem = 'PACOTE_VENDA' and v_l.client_package_id is not null then
    select case when coalesce(cp.price, 0) > 0
                then greatest(cp.price - coalesce(cp.valor_cancelado, 0), 0) / cp.price
                else 1 end
      into v_fica
      from public.client_packages cp where cp.id = v_l.client_package_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
  end if;

  -- A da venda de PRODUTO com devolução em parte (A34 da 8ª): a linha do
  -- total na proporção do que a venda passou a valer; a de um item (o "por
  -- produto"), na do que ficou daquele item.
  if v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null then
    if coalesce(v_l.item, 0) = 0 then
      select case when coalesce(ps.price, 0) > 0
                  then greatest(ps.price - coalesce(ps.valor_devolvido, 0), 0) / ps.price
                  else 1 end
        into v_fica
        from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select case when coalesce(v_l.preco, 0) > 0
                  then greatest(v_l.preco - coalesce(i.valor_devolvido, 0), 0) / v_l.preco
                  else 1 end
        into v_fica
        from public.product_sale_items i where i.sale_id = v_l.product_sale_id and i.sort_order = v_l.item;
    end if;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
  end if;

  previsto := v_valor;
  alvo     := round(v_valor * v_fracao, 2);
end $function$;

notify pgrst, 'reload schema';
