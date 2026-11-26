-- D6 da 33ª simulação (2026-11-26): Relatórios → Estoque contava "Produtos
-- zerados 1" onde o Estoque dizia "Sem estoque 0" (ES-20: "'Sem estoque' é o
-- produto sem saldo positivo no recorte… uma conta de produtos igual no Estoque
-- e nos Relatórios"; princípio 3).
--
-- O ácido tinha 8 ml (`current_rendimento`) e 0 frasco (`current_stock`; a
-- Entrada somava as embalagens ao saldo de antes, −1 + 1 — corrigido em
-- 20261212200002). O Estoque conta pelo saldo que MOSTRA: o rendimento, quando
-- o produto tem unidade de consumo, arredondado em 4 casas (`situacaoDoEstoque`,
-- `lib/estoque/situacao.ts`); `metrics_relatorio` (20261106003406) contava os
-- zerados por `current_stock`, no total e na linha de cada unidade. A régua
-- passa a ser a da tela, `saldo_de_consumo` (o rendimento; sem unidade de
-- consumo, as embalagens), nas duas contas. O "críticos" já ia por ela.

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

select pg_temp.trocar_no_corpo(
  'public.metrics_relatorio(uuid,uuid[],timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,uuid,text[])'::regprocedure,
  array[
    -- O total: o produto sem saldo positivo em nenhuma unidade do recorte.
    $t$and sz.current_stock > 0)),$t$,
    -- A linha de cada unidade: a mesma régua, por par unidade × produto.
    $t$pr.category, pr.is_active, pr.id as product_id,$t$,
    $t$count(*) filter (where current_stock <= 0 and is_active is distinct from false) zerados,$t$
  ],
  array[
    $t$and round(public.saldo_de_consumo(sz, pz), 4) > 0)),$t$,
    $t$pr.category, pr.is_active, pr.id as product_id,
               coalesce(s.product_id is not null and round(public.saldo_de_consumo(s, pr), 4) > 0, false) as positivo,$t$,
    $t$count(*) filter (where not positivo and is_active is distinct from false) zerados,$t$
  ],
  array[1, 1, 1]
);

notify pgrst, 'reload schema';
