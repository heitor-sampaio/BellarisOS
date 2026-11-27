-- A11 da 35ª simulação (ES-28; princípio 3): a venda de produto estornada
-- cujo produto NÃO voltou é perda "Venda estornada (não voltou)" em
-- Relatórios → Estoque, mas vinha sem o lote ("lote —"): a parte da venda em
-- metrics_perdas não ligava a venda ao movimento da saída (null::uuid), e os
-- lotes da linha saem de stock_movement_batches desse movimento. Liga pelo
-- movimento gravado na venda (product_sale_items.stock_movement_id; a venda de
-- antes, de um produto só, product_sales.stock_movement_id) — a mesma saída de
-- onde o produto saiu. A devolução em parte que não voltou, pelo do item.
--
-- Troca de trecho no corpo VIVO, com a conferência da contagem. O movimento só
-- alimenta os lotes da linha: a contagem (count(*)), a quantidade e o custo
-- não mudam.

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
  'public.metrics_perdas(uuid,uuid[],timestamptz,timestamptz)'::regprocedure,
  array[
    E'null::uuid\n      from public.product_sales v',
    E'null::uuid\n      from public.product_sale_returns r'
  ],
  array[
    E'coalesce(i.stock_movement_id, v.stock_movement_id)\n      from public.product_sales v',
    E'i.stock_movement_id\n      from public.product_sale_returns r'
  ],
  array[1, 1]
);

notify pgrst, 'reload schema';
