-- r2-ven-15 (F13; o Heitor, 2026-11-03: "o pacote soma inteiro para quem
-- vendeu, é óbvio, não faz nem sentido não ser assim"). Com o financeiro "só
-- os meus", o dinheiro "dela" era o ligado a um atendimento dela e a venda de
-- produto que ela vendeu (20261101000703). O pacote e o pré-pago passam a ser
-- dela também: o lançamento do pacote (`client_package_id`) conta para
-- `client_packages.sold_by`, e o do pré-pago (`procedure_sale_id`) para
-- `procedure_sales.sold_by` — como as Vendas já contavam. Pela regra única de
-- receita: no dia de cada pagamento (o pacote pago à vista entra inteiro no
-- dia da venda).
--
-- A sessão de pacote (ou a unidade pré-paga) que ela atende NÃO soma de novo:
-- a sessão não tem lançamento — o dinheiro é o da venda, e ele já é de quem
-- vendeu. (O ranking por profissional, que é de EXECUÇÃO, conta a sessão pelo
-- rateio: r2-ind-01, migration 20261103001305.)
--
-- As quatro funções com o recorte do dinheiro por pessoa, a partir do corpo
-- ATUAL da produção (o mesmo helper da 20261101000703).

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
  array['ps.id = t.product_sale_id and ps.sold_by = p_professional_id))'],
  array[E'ps.id = t.product_sale_id and ps.sold_by = p_professional_id)\n          or exists (select 1 from public.client_packages cpv\n                      where cpv.id = t.client_package_id and cpv.sold_by = p_professional_id)\n          or exists (select 1 from public.procedure_sales psv\n                      where psv.id = t.procedure_sale_id and psv.sold_by = p_professional_id))'],
  array[1])
from unnest(array[
  'public.metrics_receitas_pagas(uuid,uuid[],timestamptz,timestamptz,uuid)',
  'public.metrics_core(uuid,uuid[],timestamptz,timestamptz,uuid)',
  'public.metrics_series(uuid,uuid[],timestamptz,timestamptz,text,uuid)',
  'public.metrics_top_clients(uuid,uuid[],timestamptz,timestamptz,integer,uuid)'
]) as f;

notify pgrst, 'reload schema';
