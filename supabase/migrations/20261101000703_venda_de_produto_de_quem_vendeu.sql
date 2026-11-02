-- F7 (decisão do Heitor, 2026-11-01: "concordo"): com o financeiro "só os
-- meus", a venda de produto conta para quem a VENDEU
-- (`product_sales.sold_by`), como as Vendas já contavam. O dinheiro "dela"
-- era só o lançamento ligado a um atendimento dela; o lançamento da venda de
-- produto (`financial_transactions.product_sale_id`) passa a ser dela também.
-- As quatro funções com o recorte do dinheiro por pessoa, a partir do corpo
-- ATUAL da produção (o mesmo helper da 20261101000702).

create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
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
end
$f$;

select pg_temp.trocar_no_corpo(f::regprocedure,
  array['where a.id = t.appointment_id and a.professional_id = p_professional_id))'],
  array[E'where a.id = t.appointment_id and a.professional_id = p_professional_id)\n          or exists (select 1 from public.product_sales ps\n                      where ps.id = t.product_sale_id and ps.sold_by = p_professional_id))'],
  array[1])
from unnest(array[
  'public.metrics_receitas_pagas(uuid,uuid[],timestamptz,timestamptz,uuid)',
  'public.metrics_core(uuid,uuid[],timestamptz,timestamptz,uuid)',
  'public.metrics_series(uuid,uuid[],timestamptz,timestamptz,text,uuid)',
  'public.metrics_top_clients(uuid,uuid[],timestamptz,timestamptz,integer,uuid)'
]) as f;

notify pgrst, 'reload schema';
