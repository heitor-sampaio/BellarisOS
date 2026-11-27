-- D3 da 35ª simulação (PL-19 e o princípio 3; decisão do Claude, 27/11): o
-- plano de R$ 910 pago com R$ 860 de crédito interno e R$ 50 no Pix dizia
-- "Recebido R$ 50" na página do plano e "Pago R$ 50" no app.
--
-- O `recebido` de metrics_financeiro_do_plano saía de metrics_receitas_pagas,
-- que deixa o crédito interno de fora: é o certo para a RECEITA (o crédito não
-- é receita de novo — CI-03, VE-05), não para o que PAGOU o plano. O pago do
-- plano passa a ser o movimento pago dele (metrics_movimentos_pagos, a mesma
-- conta dos estornos), de toda forma, com o crédito interno. A receita, as
-- Vendas e o caixa não mudam (metrics_receitas_pagas fica como está).
--
-- Troca de trecho no corpo VIVO, com a conferência da contagem.

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
  'public.metrics_financeiro_do_plano(uuid, uuid)'::regprocedure,
  array[$t$from public.metrics_receitas_pagas(p_tenant, null, '2000-01-01'::timestamptz, 'infinity'::timestamptz) t
       where t.treatment_plan_id in (select id from plano)$t$],
  array[$t$from public.metrics_movimentos_pagos(p_tenant, null, '2000-01-01'::timestamptz, 'infinity'::timestamptz) t
       where t.type = 'INCOME' and t.treatment_plan_id in (select id from plano)$t$],
  array[1]
);

notify pgrst, 'reload schema';
