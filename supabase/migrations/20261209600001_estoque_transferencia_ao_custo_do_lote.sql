-- D1 da 31ª simulação (2026-11-26): a transferência vale o custo do lote que
-- saiu (ES-29: "ao custo do lote que saiu"; ES-18: "o lote transferido herda o
-- custo do de origem"; princípio 3).
--
-- 1 pote de alginato (1000 g) do lote A0, a R$ 0,11/g, foi para Itajaí e valeu
-- R$ 119,99 nos Relatórios e R$ 120,00 nas Movimentações — o lote custa R$ 110,00.
--
-- 1. `estoque_transferir` gravava as duas pernas sem `unit_cost`: quem lê o
--    custo do movimento (`custo_do_movimento`, as Movimentações, o Histórico)
--    caía no último custo (R$ 0,12/g × 1000). Agora as duas pernas gravam o
--    custo dos lotes que a saída tira, por unidade de consumo — o mesmo FEFO do
--    gatilho do lote (`on_stock_movement_lotes`: o válido que vence antes, os
--    vencidos depois), lido com a linha do saldo já travada, ANTES do insert
--    (sem um UPDATE depois, que a Auditoria leria como "Corrigiu o custo").
--    A parte que nenhum lote com custo cobre vai ao último custo (ES-18); sem
--    lote com custo nenhum, fica nulo e vale o último custo, como antes.
-- 2. `metrics_transferencias_de_estoque` somava a ligação ao lote
--    (`stock_movement_batches.quantity`, em EMBALAGENS) vezes o custo do lote por
--    unidade de CONSUMO, e o resto (1000 − 1) ao último custo: 1 × 0,11 + 999 ×
--    0,12. A ligação vai × o rendimento; a perna com custo gravado vale ele.
-- 3. As transferências de antes (decisão do Claude, 26/11; princípio 4, nada de
--    chutar): a que tem os lotes de origem ligados, cobrindo a quantidade
--    inteira e todos com custo, ganha o custo deles nas duas pernas; a outra
--    fica como está. Sem a Auditoria (não é uma edição de ninguém), como em
--    20261124600002. Na produção, 26/11: uma (a da [sim] Lobélia, R$ 0,11/g).

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

-- O custo, por unidade de consumo, do que a saída de p_embalagens vai tirar dos
-- lotes da unidade — a conta do gatilho do lote, sem mexer em lote nenhum.
create or replace function private.custo_da_saida_pelos_lotes(p_produto uuid, p_unidade uuid, p_embalagens numeric)
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
  v_soma    numeric := 0;   -- o custo das unidades de consumo que os lotes com custo cobrem
  v_coberto numeric := 0;   -- quantas unidades de consumo eles cobrem
  v_resto   numeric;
begin
  if p_embalagens is null or p_embalagens <= 0 then
    return null;
  end if;
  select public.fator_de_consumo(p) into v_fator from public.products p where p.id = p_produto;
  v_fator := coalesce(v_fator, 1);

  for v_lote in
    select b.id as v_id, b.quantity as v_qtd
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
  return (v_soma + v_resto * coalesce((select public.custo_de_consumo(p) from public.products p where p.id = p_produto), 0))
         / (v_coberto + v_resto);
end $$;

revoke all on function private.custo_da_saida_pelos_lotes(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function private.custo_da_saida_pelos_lotes(uuid, uuid, numeric) to service_role;

-- 1. As duas pernas da transferência com o custo dos lotes que saem.
select pg_temp.trocar_no_corpo(
  'public.estoque_transferir(uuid,uuid,uuid,numeric,text,text)'::regprocedure,
  array[
    $t$v_obs       text;$t$,
    $t$v_ref := 'TRANSFER-' || gen_random_uuid();$t$,
    $t$notes, reference, created_by)$t$,
    $t$v_ref, p_autor)$t$
  ],
  array[
    $t$v_obs       text; v_custo numeric;$t$,
    $t$v_ref := 'TRANSFER-' || gen_random_uuid(); v_custo := private.custo_da_saida_pelos_lotes(p_produto, p_origem, p_quantidade);$t$,
    $t$notes, reference, created_by, unit_cost)$t$,
    $t$v_ref, p_autor, v_custo)$t$
  ],
  array[1, 1, 1, 2]
);

-- 2. A métrica: a ligação ao lote × o rendimento; a perna com custo gravado vale ele.
create or replace function public.metrics_transferencias_de_estoque(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(branch_id uuid, unidade text, direcao text, outra_id uuid, outra text, product_id uuid, produto text, unidade_medida text, embalagem text, quantidade numeric, embalagens numeric, custo numeric, movimentos bigint)
 language sql
 stable
 set search_path to ''
as $function$
  with movimentos as (
    select m.*, b.name as nome_da_unidade
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
     where m.type in ('TRANSFER_OUT', 'TRANSFER_IN')
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
  ),
  pernas as (
    select m.branch_id, m.nome_da_unidade,
           case when m.type = 'TRANSFER_OUT' then 'SAIU' else 'ENTROU' end as direcao,
           o.branch_id as outra_id,
           m.product_id,
           abs(m.quantity) as qtd,
           abs(m.quantity) / public.fator_de_consumo(p) as emb,
           -- O custo da saída (a própria perna, ou a saída do mesmo par): o gravado
           -- nela; sem ele (as de antes), os lotes ligados — em embalagens, × o
           -- rendimento — e o que nenhum lote cobre ao último custo.
           (select case when s.unit_cost is not null then abs(s.quantity) * s.unit_cost
                   else coalesce(sum(abs(smb.quantity) * public.fator_de_consumo(p) * coalesce(public.custo_do_lote(smb.batch_id), public.custo_de_consumo(p), 0)), 0)
                      + greatest(abs(s.quantity) - coalesce(sum(abs(smb.quantity)), 0) * public.fator_de_consumo(p), 0) * coalesce(public.custo_de_consumo(p), 0)
                   end
              from public.stock_movements s
              left join public.stock_movement_batches smb on smb.movement_id = s.id
             where s.id = coalesce(
                     case when m.type = 'TRANSFER_OUT' then m.id end,
                     (select x.id from public.stock_movements x
                       where m.reference is not null and x.reference = m.reference and x.type = 'TRANSFER_OUT'
                         and x.product_id = m.product_id
                       limit 1),
                     m.id)
             group by s.id, s.quantity, s.unit_cost) as custo
      from movimentos m
      left join public.products p on p.id = m.product_id
      left join lateral (
        select x.branch_id from public.stock_movements x
         where m.reference is not null and x.reference = m.reference and x.id <> m.id
           and x.type in ('TRANSFER_OUT', 'TRANSFER_IN')
         limit 1
      ) o on true
  )
  select x.branch_id,
         max(x.nome_da_unidade),
         x.direcao,
         x.outra_id,
         case when grouping(x.product_id) = 0 then max(ob.name) end,
         x.product_id,
         case when grouping(x.product_id) = 0 then max(p.name) end,
         case when grouping(x.product_id) = 0 then max(case when public.tem_unidade_de_consumo(p) then p.consumption_unit else p.unit end) end,
         case when grouping(x.product_id) = 0 then max(p.unit) end,
         case when grouping(x.product_id) = 0 then sum(x.qtd) end,
         case when grouping(x.product_id) = 0 then round(sum(x.emb), 4) end,
         round(coalesce(sum(x.custo), 0), 2),
         count(*)
    from pernas x
    left join public.branches ob on ob.id = x.outra_id
    left join public.products p on p.id = x.product_id
   group by grouping sets ((x.branch_id, x.direcao, x.outra_id, x.product_id), (x.branch_id, x.direcao))
$function$;

-- 3. As de antes: o custo dos lotes ligados, quando cobrem a quantidade inteira e todos têm custo.
alter table public.stock_movements disable trigger auditoria_upd;
with custo as (
  select s.id, s.reference, s.product_id,
         sum(abs(smb.quantity) * f.fator * public.custo_do_lote(smb.batch_id)) / abs(s.quantity) as unit_cost
    from public.stock_movements s
    cross join lateral (select public.fator_de_consumo(p) as fator from public.products p where p.id = s.product_id) f
    join public.stock_movement_batches smb on smb.movement_id = s.id
   where s.type = 'TRANSFER_OUT' and s.unit_cost is null and s.quantity <> 0
   group by s.id, s.reference, s.product_id, s.quantity, f.fator
  having bool_and(public.custo_do_lote(smb.batch_id) is not null)
     and sum(abs(smb.quantity)) * f.fator >= abs(s.quantity) - 0.0001
)
update public.stock_movements m
   set unit_cost = c.unit_cost
  from custo c
 where m.unit_cost is null
   and (m.id = c.id
        or (m.type = 'TRANSFER_IN' and m.reference = c.reference and m.product_id = c.product_id));
alter table public.stock_movements enable trigger auditoria_upd;

notify pgrst, 'reload schema';
