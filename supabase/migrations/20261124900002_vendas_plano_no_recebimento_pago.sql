-- O Relatório de Vendas (`public.metrics_vendas`), dois achados da 25ª
-- simulação:
--
-- D5: a forma "Crédito na clínica" voltou. CLAUDE.md §1: "'Clínica' é a mesma
-- coisa que rede e não deve existir no sistema". A 20261116200001 tinha
-- trocado o texto por "Crédito interno"; a 20261121000001 e a 20261124250001
-- recriaram a função com o texto antigo (regressão).
--
-- O plano em Vendas: entrava no PRIMEIRO lançamento de receita do plano, pago
-- ou não — no crediário, a parcela em aberto já fazia a venda. O Heitor, 18/11
-- (DEVLOG, "O plano como venda"): "Obviamente que no recebimento. Uma coisa só
-- foi vendida se foi paga." Agora o plano entra no primeiro lançamento PAGO
-- dele, que não é estorno nem estornado, com algum valor (o dinheiro ou os
-- pontos), na data do pagamento — a mesma régua de
-- `private.plano_pagamento_que_vale` (20261124700001, o "Comprou" do CRM),
-- escrita aqui por extenso porque esta função roda como quem chama (não é
-- security definer) e o `service_role` não usa o esquema `private`. O plano
-- que só tem parcelas em aberto sai de Vendas até a primeira ser paga. Leitura
-- do Claude da fala do Heitor; o avulso não pago (D6) é pergunta ao Heitor e
-- não muda aqui.
--
-- Troca de texto sobre o corpo VIVO da função (20261124250001, conferido na
-- produção em 18/11); cada trecho tem de aparecer o número de vezes esperado,
-- ou a migration para. Os trechos são de uma linha só: o corpo vivo não
-- depende do fim de linha do arquivo que o criou. Não depende do código novo:
-- o nome, os parâmetros e o formato da função ficam (metrics_vendas_pagina e
-- metrics_vendas_resumo a leem).

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
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.metrics_vendas(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  array[
    $t$'CREDITO', cv.created_at, 'Crédito na clínica', 1,$t$,
    $t$select min(f.created_at) em$t$,
    $t$where f.treatment_plan_id = tp.id and f.type::text = 'INCOME' and f.estorno_de is null$t$
  ],
  array[
    $t$'CREDITO', cv.created_at, 'Crédito interno', 1,$t$,
    $t$select min(coalesce(f.paid_at, f.created_at)) em$t$,
    $t$where f.treatment_plan_id = tp.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.amount, 0) + coalesce(f.loyalty_discount, 0) > 0$t$
  ],
  array[1, 1, 1]);

notify pgrst, 'reload schema';
