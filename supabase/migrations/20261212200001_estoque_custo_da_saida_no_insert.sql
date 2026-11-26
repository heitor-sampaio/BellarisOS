-- D7 da 33ª simulação (2026-11-26): a Auditoria dizia "Corrigiu o custo do lote
-- de Toxina… de R$ 800 para R$ 980" na conclusão que ninguém corrigiu (AD-19: o
-- "Corrigiu o custo do lote" é o fato da PESSOA; AD-04/AD-05). Resto do D9 da
-- 31ª, que corrigiu só a transferência (20261209600001).
--
-- O gatilho do lote (`on_stock_movement_lotes`, AFTER INSERT) gravava o custo
-- dos lotes no insumo do atendimento e no ajuste a menos (D2 da 10ª: ES-18, "o
-- consumo… usa o custo do lote de onde a quantidade saiu") por um UPDATE de
-- `stock_movements.unit_cost` depois do insert — e a Auditoria lê toda edição
-- de `unit_cost` como o "Corrigir custo" (`fraseDoMovimento`).
--
-- Agora o custo vai no PRÓPRIO insert: um gatilho ANTES do insert calcula, com
-- os lotes travados, o custo dos lotes que a saída vai tirar — o lote escolhido
-- (`reference = 'lote:<id>'`) primeiro, depois o mesmo FEFO do gatilho do lote
-- (o válido que vence antes, os vencidos depois) —, e o que nenhum lote com
-- custo cobre fica com o custo que o movimento trouxe (o último; ES-18). O
-- gatilho do lote só baixa os lotes, como antes, sem o UPDATE. A conta é a
-- mesma de antes, só que antes do insert; o número gravado não muda.
--
-- `private.custo_da_saida_pelos_lotes` (a transferência) passa a chamar a mesma
-- conta: uma cópia só do FEFO do custo.
--
-- Os movimentos de antes ficam: a linha "Corrigiu o custo" já gravada é da
-- Auditoria, que não se reescreve.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end $f$;

-- O custo, por unidade de consumo, do que uma saída de p_embalagens vai tirar
-- dos lotes da unidade — a conta do gatilho do lote, sem mexer em lote nenhum.
-- p_lote: o lote escolhido (sai dele primeiro); p_custo_do_resto: o custo da
-- parte que nenhum lote com custo cobre (nulo = o último custo do produto).
-- Nulo quando nenhum lote com custo cobre nada (fica o custo do movimento).
create or replace function private.custo_da_saida_do_movimento(p_produto uuid, p_unidade uuid, p_embalagens numeric, p_lote uuid, p_custo_do_resto numeric)
returns numeric
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fator   numeric;
  v_pedido  numeric := p_embalagens;
  v_lote    record;
  v_tira    numeric;
  v_custo   numeric;
  v_do_alvo numeric := 0;   -- o que sai do lote escolhido
  v_soma    numeric := 0;   -- o custo das unidades de consumo que os lotes com custo cobrem
  v_coberto numeric := 0;   -- quantas unidades de consumo eles cobrem
  v_resto   numeric;
begin
  if p_embalagens is null or p_embalagens <= 0 then
    return null;
  end if;
  select public.fator_de_consumo(p) into v_fator from public.products p where p.id = p_produto;
  v_fator := coalesce(v_fator, 1);

  -- O lote escolhido (a perda do frasco vencido, o ajuste a menos): ele primeiro.
  if p_lote is not null then
    select b.quantity into v_tira
      from public.product_batches b
     where b.id = p_lote and b.product_id = p_produto and b.branch_id = p_unidade
       and b.quantity > 0
       for update;
    if found then
      v_do_alvo := least(v_tira, v_pedido);
      v_pedido := v_pedido - v_do_alvo;
      v_custo := public.custo_do_lote(p_lote);
      if v_custo is not null then
        v_soma := v_soma + v_do_alvo * v_fator * v_custo;
        v_coberto := v_coberto + v_do_alvo * v_fator;
      end if;
    end if;
  end if;

  for v_lote in
    select b.id as v_id, b.quantity - case when b.id = p_lote then v_do_alvo else 0 end as v_qtd
      from public.product_batches b
     where b.product_id = p_produto
       and b.branch_id = p_unidade
       and b.quantity > 0
     order by coalesce((b.expires_at at time zone 'UTC')::date < (now() at time zone public.fuso_da_unidade(b.branch_id))::date, false),
              b.expires_at nulls last,
              b.received_at
       for update
  loop
    exit when v_pedido <= 0;
    continue when v_lote.v_qtd <= 0;
    v_tira := least(v_lote.v_qtd, v_pedido);
    v_pedido := v_pedido - v_tira;
    v_custo := public.custo_do_lote(v_lote.v_id);
    if v_custo is not null then
      v_soma := v_soma + v_tira * v_fator * v_custo;
      v_coberto := v_coberto + v_tira * v_fator;
    end if;
  end loop;

  if v_coberto <= 0 then
    return null;
  end if;
  v_resto := greatest(p_embalagens * v_fator - v_coberto, 0);
  return (v_soma + v_resto * coalesce(p_custo_do_resto,
                                      (select public.custo_de_consumo(p) from public.products p where p.id = p_produto), 0))
         / (v_coberto + v_resto);
end $$;

revoke all on function private.custo_da_saida_do_movimento(uuid, uuid, numeric, uuid, numeric) from public, anon, authenticated;
grant execute on function private.custo_da_saida_do_movimento(uuid, uuid, numeric, uuid, numeric) to service_role;

-- A transferência (20261209600001) pela mesma conta.
create or replace function private.custo_da_saida_pelos_lotes(p_produto uuid, p_unidade uuid, p_embalagens numeric)
returns numeric
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return private.custo_da_saida_do_movimento(p_produto, p_unidade, p_embalagens, null, null);
end $$;

revoke all on function private.custo_da_saida_pelos_lotes(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function private.custo_da_saida_pelos_lotes(uuid, uuid, numeric) to service_role;

-- O gatilho ANTES do insert: o insumo do atendimento e o ajuste a menos (o
-- inventário, o "Ajuste desfeito", o brinde da fidelidade) nascem com o custo
-- dos lotes de onde vão sair. A perda e a venda já gravam o delas.
create or replace function private.custo_da_saida_no_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fator numeric;
  v_lote  uuid;
  v_custo numeric;
begin
  if new.type in ('PROCEDURE_USAGE', 'MANUAL_ADJUSTMENT') and new.quantity < 0 then
    select public.fator_de_consumo(p) into v_fator from public.products p where p.id = new.product_id;
    v_fator := coalesce(nullif(v_fator, 0), 1);
    if new.reference ~ '^lote:[0-9a-fA-F-]{36}$' then
      v_lote := substring(new.reference from 6)::uuid;
    end if;
    v_custo := private.custo_da_saida_do_movimento(new.product_id, new.branch_id, -new.quantity / v_fator, v_lote, new.unit_cost);
    if v_custo is not null then
      new.unit_cost := v_custo;
    end if;
  end if;
  return new;
end $$;

revoke all on function private.custo_da_saida_no_insert() from public, anon, authenticated;

drop trigger if exists trg_custo_da_saida_pelos_lotes on public.stock_movements;
create trigger trg_custo_da_saida_pelos_lotes
  before insert on public.stock_movements
  for each row execute function private.custo_da_saida_no_insert();

-- O gatilho do lote deixa de gravar o custo depois do insert.
select pg_temp.trocar_no_corpo(
  'public.on_stock_movement_lotes()'::regprocedure,
  array[
    $t$  -- D2 da 10ª: o consumo e o ajuste negativo ao custo dos lotes de onde saíram
  -- (a perda e a venda já gravam o delas); o resto, o custo que veio no movimento.
  if new.type in ('PROCEDURE_USAGE', 'MANUAL_ADJUSTMENT') and v_coberto > 0 then
    v_total := -new.quantity;
    v_resto := greatest(v_total - v_coberto, 0);
    update public.stock_movements
       set unit_cost = (v_soma + v_resto * coalesce(new.unit_cost,
                          (select public.custo_de_consumo(p) from public.products p where p.id = new.product_id), 0))
                       / (v_coberto + v_resto)
     where id = new.id;
  end if;
$t$
  ],
  array[
    $t$  -- D2 da 10ª (o consumo e o ajuste a menos ao custo dos lotes de onde saíram):
  -- o custo vai no próprio insert, pelo gatilho ANTES (trg_custo_da_saida_pelos_lotes,
  -- D7 da 33ª) — o UPDATE daqui a Auditoria lia como "Corrigiu o custo do lote".
$t$
  ],
  array[1]
);

notify pgrst, 'reload schema';
