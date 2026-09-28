-- Lotes (product_batches) passam a ser DA UNIDADE e a BAIXAR com o consumo.
--
-- Dois defeitos, um só desenho:
--  1. A tabela não tinha `branch_id`, e o saldo é por unidade
--     (`branch_product_stock`). `adminAddStock` gravava `branch_id` no lote — e
--     toda entrada de estoque COM número de lote falhava, depois de já ter
--     gravado o movimento e o saldo. Um lote sem unidade também não diz onde
--     está a mercadoria que vence.
--  2. O lote nunca baixava: o alerta de "vencendo" contava o que já tinha sido
--     usado, e não havia como saber de qual lote saiu o que foi aplicado.
--
-- A baixa é GATILHO em `stock_movements`, pela mesma razão do evento de
-- estoque (20260923000003): cinco caminhos do código gravam movimentação, e
-- instrumentar um a um é garantir esquecer o próximo.
--
-- Regra: FEFO — sai primeiro o que vence primeiro, entre os lotes AINDA NÃO
-- vencidos; os vencidos só depois (vencido se descarta por ajuste; consumir
-- dele é o último recurso, e a ligação registra que aconteceu). O que o
-- movimento pede além do que os lotes têm fica sem lote: estoque que entrou
-- sem número de lote continua existindo.
--
-- Cada baixa deixa a ligação em `stock_movement_batches` (movimento × lote ×
-- quantidade): é o que diz de qual lote saiu o que foi aplicado num
-- atendimento, e é o que leva o lote junto numa transferência.

-- ─── O lote tem unidade ───────────────────────────────────────────────────
alter table public.product_batches
  add column if not exists branch_id uuid references public.branches(id) on delete cascade;

-- O que já existe: a unidade da compra mais próxima no tempo, do mesmo produto.
update public.product_batches pb
set branch_id = (
  select sm.branch_id
  from public.stock_movements sm
  where sm.product_id = pb.product_id
    and sm.type = 'PURCHASE'
  order by abs(extract(epoch from (sm.created_at - pb.received_at)))
  limit 1
)
where pb.branch_id is null;

create index if not exists product_batches_produto_unidade
  on public.product_batches (product_id, branch_id)
  where quantity > 0;

-- Leitura pela unidade do LOTE. A antiga passava por `products.branch_id`, que
-- é nulo no catálogo da rede — pela sessão, ninguém lia lote nenhum.
alter policy product_batches_select on public.product_batches
  using ((jwt_claim('role') <> 'CLIENT') and private.can_access_branch(branch_id));

-- ─── De qual lote saiu cada movimento ─────────────────────────────────────
create table if not exists public.stock_movement_batches (
  movement_id uuid not null references public.stock_movements(id) on delete cascade,
  batch_id    uuid not null references public.product_batches(id) on delete cascade,
  quantity    numeric(10,4) not null check (quantity > 0),
  primary key (movement_id, batch_id)
);

comment on table public.stock_movement_batches is
  'De qual lote saiu (ou entrou) cada movimento. Escrita só pelo gatilho '
  'trg_lote_do_movimento; o app lê.';

alter table public.stock_movement_batches enable row level security;

create policy stock_movement_batches_select on public.stock_movement_batches
  for select using (
    (jwt_claim('role') <> 'CLIENT')
    and exists (
      select 1 from public.product_batches b
      where b.id = batch_id and private.can_access_branch(b.branch_id)
    )
  );

-- ─── O gatilho ────────────────────────────────────────────────────────────
-- ⚠️ Nenhuma variável com nome de coluna (CLAUDE.md §9.2.1: 42702 dentro do
-- gatilho descarta o insert). Tudo com prefixo v_.
create or replace function public.on_stock_movement_lotes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido  numeric;
  v_upp     numeric;
  v_consumo text;
  v_lote    record;
  v_tira    numeric;
  v_novo    uuid;
begin
  -- Entrada de TRANSFERÊNCIA: os lotes que a saída consumiu chegam aqui, com o
  -- mesmo número e a mesma validade. A saída é a linha irmã (mesma
  -- `reference`), gravada no mesmo insert e processada antes.
  if new.type = 'TRANSFER_IN' then
    for v_lote in
      select b.batch_number, b.expires_at, smb.quantity as v_qtd
      from public.stock_movements o
      join public.stock_movement_batches smb on smb.movement_id = o.id
      join public.product_batches b on b.id = smb.batch_id
      where o.type = 'TRANSFER_OUT'
        and o.reference = new.reference
        and o.product_id = new.product_id
    loop
      insert into public.product_batches (product_id, branch_id, batch_number, expires_at, quantity)
      values (new.product_id, new.branch_id, v_lote.batch_number, v_lote.expires_at, v_lote.v_qtd)
      returning id into v_novo;
      insert into public.stock_movement_batches (movement_id, batch_id, quantity)
      values (new.id, v_novo, v_lote.v_qtd);
    end loop;
    return new;
  end if;

  -- Só saída baixa lote. Entrada com lote é o app quem cria (ele tem o número
  -- e a validade que a pessoa digitou).
  if new.quantity >= 0 then return new; end if;

  -- O lote é contado em EMBALAGENS. O consumo no atendimento grava em unidade
  -- de consumo (ml, UI) quando o produto tem rendimento — a mesma condição de
  -- `finishSession`: `units_per_package` E `consumption_unit`.
  v_pedido := -new.quantity;
  if new.type = 'PROCEDURE_USAGE' then
    select p.units_per_package, p.consumption_unit into v_upp, v_consumo
    from public.products p where p.id = new.product_id;
    if coalesce(v_upp, 0) > 0 and v_consumo is not null then
      v_pedido := v_pedido / v_upp;
    end if;
  end if;

  for v_lote in
    select b.id as v_id, b.quantity as v_qtd
    from public.product_batches b
    where b.product_id = new.product_id
      and b.branch_id = new.branch_id
      and b.quantity > 0
    order by coalesce(b.expires_at < current_date, false),  -- os não vencidos antes
             b.expires_at nulls last,
             b.received_at
    for update
  loop
    exit when v_pedido <= 0;
    v_tira := least(v_lote.v_qtd, v_pedido);
    update public.product_batches set quantity = quantity - v_tira where id = v_lote.v_id;
    insert into public.stock_movement_batches (movement_id, batch_id, quantity)
    values (new.id, v_lote.v_id, v_tira);
    v_pedido := v_pedido - v_tira;
  end loop;

  return new;
end
$$;

comment on function public.on_stock_movement_lotes is
  'Baixa os lotes da unidade (FEFO, não vencidos primeiro) a cada saída de '
  'estoque e leva os lotes na transferência. No banco porque cinco caminhos '
  'gravam movimentação.';

drop trigger if exists trg_lote_do_movimento on public.stock_movements;
create trigger trg_lote_do_movimento
  after insert on public.stock_movements
  for each row execute function public.on_stock_movement_lotes();

revoke execute on function public.on_stock_movement_lotes() from public, anon, authenticated;

notify pgrst, 'reload schema';
