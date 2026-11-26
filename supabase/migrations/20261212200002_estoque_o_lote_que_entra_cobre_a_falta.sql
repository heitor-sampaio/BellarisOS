-- D5 da 33ª simulação (2026-11-26): o saldo do produto e a soma dos lotes têm de
-- bater (ES-18: "a parte que nenhum lote cobre usa o último custo"; ES-25: "Cada
-- atendimento… diz o que se tirou de cada lote"; ES-20; princípio 3).
--
-- O ácido (frasco de 10 ml) acabou no meio de um atendimento: 2 ml do lote AM1 e
-- 2 ml sem lote, o saldo em −2 ml ("Insumo faltando NÃO impede o fechamento…
-- o saldo fica negativo", atendimento.md §10). A entrada do AM2 (1 frasco, 10 ml)
-- levou o saldo a 8 ml, e o lote ficou com 10 ml: o gatilho do lote ignora todo
-- movimento positivo, e quem põe no lote (a Entrada, o Ajuste a mais, a
-- transferência que chega, a devolução, o desfazer) não sabia da falta.
--
-- 1. O lote que entra cobre a falta (decisão do Claude, 26/11, pelo princípio 3
--    e pela ES-18): a falta de ANTES do movimento — o saldo negativo, que nenhum
--    lote cobriu — sai dos lotes em que o movimento positivo pôs, até o que os
--    lotes têm a mais que o saldo (nunca deixa os lotes abaixo do saldo). O AM2
--    fica com 8 ml. A ligação da entrada ao lote passa a dizer o que ENTROU no
--    lote (0,8 frasco): o "Desfazer entrada" e o "Desfazer ajuste" conferem por
--    ela, e o Histórico diz "2 ml cobriram a falta de antes (sem lote)" pela
--    diferença. O lote que a falta consome inteiro perde a ligação (ela não
--    guarda zero). O consumo de antes fica como foi: 2 ml do AM1 e 2 ml sem
--    lote, ao custo de então (o movimento não se reescreve).
--    É um gatilho ADIADO para o fim da transação: a Entrada grava o movimento
--    ANTES do lote que ela cria, e o saldo depois dele.
-- 2. A entrada gravava as embalagens somando ao saldo de antes: −1 frasco (a
--    embalagem devida, `lib/estoque/baixa.ts`) + 1 = 0, com o rendimento em 8 ml
--    — o produto ficava "0 frasco" com 8 ml na prateleira (e Relatórios → Estoque
--    o contava zerado, D6). As embalagens passam a ser o rendimento arredondado,
--    a regra da baixa (a aberta conta inteira; a devida, para longe do zero).
-- 3. As Movimentações de Relatórios → Estoque recebem, em cada lote, a ligação
--    (em embalagens) e o rendimento: a tela diz o que cada lote cobriu
--    (`partesDoMovimento`, `lib/estoque/lotes-do-movimento.ts`).
-- 4. Os de antes (princípio 4: só o que o banco prova): a entrada com lote
--    gravada com o saldo de antes negativo, no produto cujos lotes passam do
--    saldo hoje, cobre a falta pela mesma regra; e a linha com as embalagens
--    fora do rendimento (o saldo positivo) volta à conta da baixa. Na produção,
--    26/11: uma de cada (o Ácido mandélico da [sim] Studio Gloxínia: AM2 de 1 →
--    0,8 frasco; 0 → 1 frasco). Sem a Auditoria (não é a edição de ninguém),
--    como em 20261209600001. Os 56 pares com lotes ABAIXO do saldo não são
--    defeito: é o estoque que entrou sem lote (a Entrada sem número nem
--    validade), e o lote de 0,0001 frasco a mais da [sim] Studio Lírio é o
--    arredondamento das 4 casas da ligação.

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

-- 1. A falta de antes do movimento positivo, coberta pelos lotes em que ele pôs.
create or replace function private.lote_cobre_a_falta_do_movimento(p_mov uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m       public.stock_movements%rowtype;
  v_p       public.products%rowtype;
  v_fator   numeric;
  v_divida  numeric;   -- a falta de antes, em embalagens
  v_saldo   numeric;   -- o saldo agora, na unidade de consumo
  v_lotes   numeric;   -- o que os lotes têm agora, em embalagens
  v_excesso numeric;
  v_abate   numeric;
  v_lig     record;
  v_tira    numeric;
begin
  select m.* into v_m from public.stock_movements m where m.id = p_mov;
  if not found or v_m.quantity <= 0 then
    return;
  end if;
  select * into v_p from public.products p where p.id = v_m.product_id;
  if not found then
    return;
  end if;
  v_fator := coalesce(nullif(public.fator_de_consumo(v_p), 0), 1);

  -- O saldo de ANTES do movimento negativo é a falta que nenhum lote cobriu.
  v_divida := greatest(-(v_m.balance_after - v_m.quantity), 0) / v_fator;
  if round(v_divida, 6) <= 0 then
    return;
  end if;

  select public.saldo_de_consumo(s, v_p) into v_saldo
    from public.branch_product_stock s
   where s.product_id = v_m.product_id and s.branch_id = v_m.branch_id
     for update;
  if not found then
    return;
  end if;
  perform 1 from public.product_batches b
   where b.product_id = v_m.product_id and b.branch_id = v_m.branch_id
     for update;
  select coalesce(sum(b.quantity), 0) into v_lotes
    from public.product_batches b
   where b.product_id = v_m.product_id and b.branch_id = v_m.branch_id and b.quantity > 0;

  -- Nunca deixa os lotes abaixo do saldo.
  v_excesso := v_lotes - greatest(v_saldo, 0) / v_fator;
  v_abate := least(v_divida, v_excesso);
  if round(v_abate, 4) <= 0 then
    return;
  end if;

  for v_lig in
    select smb.batch_id as v_lote, smb.quantity as v_ligada, b.quantity as v_no_lote
      from public.stock_movement_batches smb
      join public.product_batches b on b.id = smb.batch_id
     where smb.movement_id = v_m.id
     order by b.expires_at nulls last, b.received_at, b.id
  loop
    exit when round(v_abate, 6) <= 0;
    v_tira := least(v_lig.v_ligada, v_lig.v_no_lote, v_abate);
    continue when v_tira <= 0;
    update public.product_batches set quantity = quantity - v_tira where id = v_lig.v_lote;
    if round(v_lig.v_ligada - v_tira, 6) <= 0 then
      delete from public.stock_movement_batches where movement_id = v_m.id and batch_id = v_lig.v_lote;
    else
      update public.stock_movement_batches set quantity = quantity - v_tira
       where movement_id = v_m.id and batch_id = v_lig.v_lote;
    end if;
    v_abate := v_abate - v_tira;
  end loop;
end $$;

revoke all on function private.lote_cobre_a_falta_do_movimento(uuid) from public, anon, authenticated;
grant execute on function private.lote_cobre_a_falta_do_movimento(uuid) to service_role;

create or replace function private.lote_cobre_a_falta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lote_cobre_a_falta_do_movimento(new.id);
  return null;
end $$;

revoke all on function private.lote_cobre_a_falta() from public, anon, authenticated;

-- Adiado: a Entrada cria o lote e grava o saldo DEPOIS do movimento.
drop trigger if exists trg_lote_cobre_a_falta on public.stock_movements;
create constraint trigger trg_lote_cobre_a_falta
  after insert on public.stock_movements
  deferrable initially deferred
  for each row
  when (new.quantity > 0)
  execute function private.lote_cobre_a_falta();

-- 2. A entrada grava as embalagens pelo rendimento.
select pg_temp.trocar_no_corpo(
  'public.estoque_entrada(uuid,uuid,numeric,numeric,text,text,timestamp with time zone,text,text,text,text)'::regprocedure,
  array[
    $t$  v_novo_rend  := case when v_upp is not null and v_rendimento is not null then v_rendimento + p_quantidade * v_upp end;$t$
  ],
  array[
    $t$  v_novo_rend  := case when v_upp is not null and v_rendimento is not null then v_rendimento + p_quantidade * v_upp end;
  -- D5 da 33ª: as embalagens são o rendimento arredondado (a aberta inteira, a
  -- devida para longe do zero — lib/estoque/baixa.ts), não o saldo de antes + o
  -- que entrou (−1 + 1 = 0 frasco com 8 ml).
  if v_novo_rend is not null then
    v_novo_saldo := case when v_novo_rend >= 0 then ceil(round(v_novo_rend / v_upp, 6)) else floor(round(v_novo_rend / v_upp, 6)) end;
  end if;$t$
  ],
  array[1]
);

-- 3. As Movimentações dos Relatórios: a ligação a cada lote e o rendimento.
select pg_temp.trocar_no_corpo(
  'public.metrics_movimentos_de_estoque(uuid,uuid[],timestamp with time zone,timestamp with time zone,integer,integer)'::regprocedure,
  array[
    $t$jsonb_build_object('numero', pb.batch_number, 'validade', pb.expires_at)$t$
  ],
  array[
    $t$jsonb_build_object('numero', pb.batch_number, 'validade', pb.expires_at, 'embalagens', smb.quantity, 'fator', public.fator_de_consumo(p))$t$
  ],
  array[1]
);

-- 4. Os de antes.
alter table public.product_batches disable trigger auditoria_upd;
do $$
declare
  r record;
begin
  for r in
    select m.id
      from public.stock_movements m
     where m.quantity > 0
       and m.balance_after - m.quantity < 0
       and exists (select 1 from public.stock_movement_batches smb where smb.movement_id = m.id)
     order by m.created_at, m.id
  loop
    perform private.lote_cobre_a_falta_do_movimento(r.id);
  end loop;
end $$;
alter table public.product_batches enable trigger auditoria_upd;

alter table public.branch_product_stock disable trigger trg_stock_below_min;
update public.branch_product_stock s
   set current_stock = ceil(round(s.current_rendimento / p.units_per_package, 6)), updated_at = now()
  from public.products p
 where p.id = s.product_id
   and public.tem_unidade_de_consumo(p)
   and s.current_rendimento is not null
   and s.current_rendimento >= 0
   and s.current_stock <> ceil(round(s.current_rendimento / p.units_per_package, 6));
alter table public.branch_product_stock enable trigger trg_stock_below_min;

notify pgrst, 'reload schema';
