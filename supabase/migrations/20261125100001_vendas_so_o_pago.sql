-- D6 (o Heitor, 18/11, sobre a 25ª simulação): "nao pago nao conta na venda".
--
-- A pergunta: o atendimento avulso, o pacote, o pré-pago e o produto NÃO pagos
-- contam em Relatórios → Vendas? Contavam — o avulso concluído pelo dia em que
-- aconteceu, o pacote e o pré-pago pela venda, o produto pela venda e o
-- crédito vendido pela criação, pagos ou não. O plano já entrava só no
-- primeiro recebimento PAGO (20261124900002; o Heitor, 18/11: "Uma coisa só
-- foi vendida se foi paga.").
--
-- Agora todos os tipos seguem a régua do plano, a mesma por extenso: a venda
-- entra quando há dinheiro pago dela — o primeiro lançamento de RECEITA ligado
-- a ela (o avulso por `appointment_id`, o pacote por `client_package_id`, o
-- pré-pago por `procedure_sale_id`, o produto por `product_sale_id`, o crédito
-- por `credito_vendido_id`) que está pago, não é estorno nem estornado e tem
-- algum valor (o dinheiro ou os pontos e o voucher, `loyalty_discount`) —, na
-- data desse recebimento (`min(coalesce(paid_at, created_at))`), para os tipos
-- baterem entre si. O que só tem parcela em aberto sai de Vendas até a
-- primeira ser paga; o que teve o único pagamento estornado inteiro também
-- sai ("Uma coisa só foi vendida se foi paga").
--
-- O VALOR de cada tipo não muda (o vendido, menos o cancelado, o devolvido e
-- o desconto, como antes), nem o "Quem vendeu", nem quem fica fora (a sessão
-- de pacote, de plano e a unidade pré-paga; o pacote trazido de fora; o
-- produto estornado). O pago com crédito interno é pago: a venda é o que se
-- paga com ele.
--
-- Troca de texto sobre o corpo VIVO (o de 20261124900002, conferido na
-- produção em 18/11); cada trecho tem de aparecer o número de vezes esperado,
-- ou a migration para. Trechos de uma linha só. O nome, os parâmetros e o
-- formato da função ficam: metrics_vendas_pagina e metrics_vendas_resumo a
-- leem, e o código não muda por ela.

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
    $t$'PROCEDIMENTO', a.aconteceu_em, pr.name, 1,$t$,
    $t$left join public.comandas k on k.appointment_id = a.id$t$,
    $t$and a.aconteceu_em between p_from and p_to$t$,
    $t$'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,$t$,
    $t$left join public.comandas k on k.client_package_id = cp.id$t$,
    $t$where cp.purchased_at between p_from and p_to$t$,
    $t$'PRE_PAGO', v.sold_at, pr.name, v.quantity,$t$,
    $t$left join public.comandas k on k.procedure_sale_id = v.id$t$,
    $t$and v.sold_at between p_from and p_to$t$,
    $t$'PRODUTO', ps.sold_at, coalesce(ps.descricao, p.name),$t$,
    $t$left join public.comandas k on k.product_sale_id = ps.id$t$,
    $t$and ps.sold_at between p_from and p_to$t$,
    $t$'CREDITO', cv.created_at, 'Crédito interno', 1,$t$,
    $t$left join public.comandas k on k.credito_vendido_id = cv.id$t$,
    $t$and cv.created_at between p_from and p_to$t$
  ],
  array[
    $t$'PROCEDIMENTO', rec.em, pr.name, 1,$t$,
    $t$left join public.comandas k on k.appointment_id = a.id cross join lateral (select min(coalesce(f.paid_at, f.created_at)) em from public.financial_transactions f where f.appointment_id = a.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.amount, 0) + coalesce(f.loyalty_discount, 0) > 0) rec$t$,
    $t$and rec.em between p_from and p_to$t$,
    $t$'PACOTE', rec.em, sp.name, cp.total_sessions,$t$,
    $t$left join public.comandas k on k.client_package_id = cp.id cross join lateral (select min(coalesce(f.paid_at, f.created_at)) em from public.financial_transactions f where f.client_package_id = cp.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.amount, 0) + coalesce(f.loyalty_discount, 0) > 0) rec$t$,
    $t$where rec.em between p_from and p_to$t$,
    $t$'PRE_PAGO', rec.em, pr.name, v.quantity,$t$,
    $t$left join public.comandas k on k.procedure_sale_id = v.id cross join lateral (select min(coalesce(f.paid_at, f.created_at)) em from public.financial_transactions f where f.procedure_sale_id = v.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.amount, 0) + coalesce(f.loyalty_discount, 0) > 0) rec$t$,
    $t$and rec.em between p_from and p_to$t$,
    $t$'PRODUTO', rec.em, coalesce(ps.descricao, p.name),$t$,
    $t$left join public.comandas k on k.product_sale_id = ps.id cross join lateral (select min(coalesce(f.paid_at, f.created_at)) em from public.financial_transactions f where f.product_sale_id = ps.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.amount, 0) + coalesce(f.loyalty_discount, 0) > 0) rec$t$,
    $t$and rec.em between p_from and p_to$t$,
    $t$'CREDITO', rec.em, 'Crédito interno', 1,$t$,
    $t$left join public.comandas k on k.credito_vendido_id = cv.id cross join lateral (select min(coalesce(f.paid_at, f.created_at)) em from public.financial_transactions f where f.credito_vendido_id = cv.id and f.type::text = 'INCOME' and f.estorno_de is null and coalesce(f.is_paid, false) and f.category is distinct from 'Estorno' and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.amount, 0) + coalesce(f.loyalty_discount, 0) > 0) rec$t$,
    $t$and rec.em between p_from and p_to$t$
  ],
  array[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

notify pgrst, 'reload schema';
