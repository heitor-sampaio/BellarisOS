-- A13 da 31ª simulação (2026-11-26; princípio 3): depois do "Corrigir custo" do
-- lote (A10 da 24ª), o Histórico da entrada mostrava só o custo novo — sem o
-- antigo nem a marca de que foi corrigido. `estoque_corrigir_custo_do_lote`
-- sobrescreve o `unit_cost` da entrada, e o de antes só ficava na Auditoria.
--
-- A entrada passa a guardar o custo de ANTES da primeira correção (por unidade
-- de consumo, como o `unit_cost`) e quando foi corrigida pela última vez. O
-- Histórico diz "Custo corrigido de X para Y" (decisão do Claude, 26/11: o "de"
-- é o custo com que a entrada foi gravada; as correções do meio estão na
-- Auditoria).

alter table public.stock_movements
  add column if not exists custo_corrigido_de numeric,
  add column if not exists custo_corrigido_em timestamp with time zone;

comment on column public.stock_movements.custo_corrigido_de is
  'O custo (por unidade de consumo) com que a entrada foi gravada, antes do primeiro "Corrigir custo" do lote. Nulo = nunca corrigido.';
comment on column public.stock_movements.custo_corrigido_em is
  'Quando o custo da entrada foi corrigido pela última vez ("Corrigir custo" do lote).';

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

-- 1. A correção guarda o de antes (só na primeira) e quando.
select pg_temp.trocar_no_corpo(
  'public.estoque_corrigir_custo_do_lote(uuid,uuid,numeric)'::regprocedure,
  array[$t$update public.stock_movements set unit_cost = p_custo_embalagem / v_fator where id = v_entrada;$t$],
  array[$t$update public.stock_movements set unit_cost = p_custo_embalagem / v_fator, custo_corrigido_de = coalesce(custo_corrigido_de, unit_cost), custo_corrigido_em = now() where id = v_entrada;$t$],
  array[1]
);

-- 2. As corrigidas antes: o de antes vem da Auditoria — a edição do custo da
--    entrada DEPOIS de gravada (a do gatilho do lote, no mesmo instante do
--    insert, não é correção) e com o valor de antes. Na produção, 26/11: uma
--    (a entrada de R$ 520,00 corrigida para R$ 52,00). Sem a Auditoria (não é
--    uma edição de ninguém), como em 20261124600002.
alter table public.stock_movements disable trigger auditoria_upd;
with correcao as (
  select m.id,
         (array_agg((a.antes ->> 'unit_cost')::numeric order by a.criado_em, a.id))[1] as de,
         max(a.criado_em) as em
    from public.stock_movements m
    join public.auditoria a on a.tabela = 'stock_movements' and a.registro_id = m.id::text and a.operacao = 'editou'
   where m.type in ('PURCHASE', 'MANUAL_ADJUSTMENT') and m.quantity > 0
     and m.custo_corrigido_de is null
     and a.colunas @> array['unit_cost'] and a.antes ->> 'unit_cost' is not null
     and a.criado_em > m.created_at + interval '1 second'
   group by m.id
)
update public.stock_movements m
   set custo_corrigido_de = c.de, custo_corrigido_em = c.em
  from correcao c
 where m.id = c.id;
alter table public.stock_movements enable trigger auditoria_upd;

notify pgrst, 'reload schema';
