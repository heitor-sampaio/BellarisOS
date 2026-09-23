-- Eventos de estoque: `estoque.movimentado` e `estoque.abaixo_do_minimo`.
--
-- Gatilho no banco pela mesma razão do pagamento: **cinco lugares do código
-- escrevem movimentação** (entrada de produto, ajuste manual, transferência
-- entre unidades, consumo no atendimento, entrada por nota) e instrumentar um
-- a um é garantir esquecer o sexto. Aqui a falta seria um alerta de estoque
-- que não dispara — a clínica descobre que acabou na hora de aplicar.
--
-- O preço conhecido: sem ator, porque a escrita passa pelo service role.
-- `origem = 'banco'`.

-- ─── Movimentação ─────────────────────────────────────────────────────────
create or replace function public.on_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_produto text;
  v_unidade text;
begin
  select b.tenant_id into v_tenant
  from public.branches b where b.id = new.branch_id;
  if v_tenant is null then return new; end if;

  select p.name, p.unit into v_produto, v_unidade
  from public.products p where p.id = new.product_id;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    v_tenant, new.branch_id, 'estoque.movimentado', 'estoque', new.product_id,
    jsonb_build_object(
      'produtoId',   new.product_id,
      'produtoNome', v_produto,
      'unidade',     v_unidade,
      'tipo',        new.type::text,
      'quantidade',  new.quantity,
      -- Saldo DEPOIS do movimento: é o que a automação usa para decidir, e
      -- `stock_movements` já o guarda como retrato imutável.
      'saldoApos',   new.balance_after,
      'observacao',  new.notes
    ),
    'sistema', 'banco', 'estoque.movimentado:' || new.id, coalesce(new.created_at, now())
  )
  on conflict (tenant_id, chave) where chave is not null do nothing;

  return new;
end
$$;

comment on function public.on_stock_movement is
  'Emite estoque.movimentado. No banco porque cinco caminhos do código gravam '
  'movimentação e instrumentar um a um é esquecer o sexto.';

drop trigger if exists trg_stock_movement on public.stock_movements;
create trigger trg_stock_movement
  after insert on public.stock_movements
  for each row execute function public.on_stock_movement();


-- ─── Abaixo do mínimo ─────────────────────────────────────────────────────
--
-- ⚠️ Dispara na TRAVESSIA, não enquanto o saldo está baixo. A diferença é o
-- que separa um alerta de um incômodo: sem isso, cada consumo de um produto já
-- abaixo do mínimo emitiria de novo, e a automação mandaria a mesma mensagem
-- cinco vezes no mesmo dia. A condição é "estava igual ou acima, passou a
-- estar abaixo".
create or replace function public.on_stock_below_min()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_produto text;
  v_unidade text;
begin
  if new.min_stock is null or new.min_stock <= 0 then return new; end if;
  if new.current_stock >= new.min_stock then return new; end if;
  -- Já estava abaixo: não é travessia, é continuação.
  if tg_op = 'UPDATE' and old.current_stock < old.min_stock then return new; end if;

  select b.tenant_id into v_tenant
  from public.branches b where b.id = new.branch_id;
  if v_tenant is null then return new; end if;

  select p.name, p.unit into v_produto, v_unidade
  from public.products p where p.id = new.product_id;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    v_tenant, new.branch_id, 'estoque.abaixo_do_minimo', 'estoque', new.product_id,
    jsonb_build_object(
      'produtoId',   new.product_id,
      'produtoNome', v_produto,
      'unidade',     v_unidade,
      'saldo',       new.current_stock,
      'minimo',      new.min_stock
    ),
    'sistema', 'banco',
    -- SEM chave de idempotência: o produto pode cruzar o mínimo, ser reposto e
    -- cruzar de novo no mês seguinte, e a segunda vez é um alerta novo. Quem
    -- evita a repetição é a detecção de travessia acima, não a chave.
    null,
    now()
  );

  return new;
end
$$;

comment on function public.on_stock_below_min is
  'Emite estoque.abaixo_do_minimo na TRAVESSIA do mínimo. Sem a detecção de '
  'travessia, cada consumo de um produto já baixo repetiria o alerta.';

drop trigger if exists trg_stock_below_min on public.branch_product_stock;
create trigger trg_stock_below_min
  after insert or update of current_stock, min_stock on public.branch_product_stock
  for each row execute function public.on_stock_below_min();
