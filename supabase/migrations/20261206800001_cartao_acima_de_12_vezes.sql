-- O cartão de crédito acima de 12 vezes. O Heitor, 25/11, perguntado se o "no
-- máximo, avisar" do princípio 2 vale para o limite de 12 vezes: "Se não for
-- impossível, ainda que improvável, pode ser feito." Acima de 12 a tela AVISA e
-- o servidor GRAVA; só o impossível se recusa.
--
-- O impossível (decisão do Claude, 25/11): zero, negativo, fracionário (as
-- colunas são inteiras) e acima de 1.200 vezes — cada parcela vira um recebível
-- da operadora com data mensal, e 1.200 meses são 100 anos, o mesmo limite das
-- datas (`LIMITE_DE_MESES`, `LIMITE_DE_VEZES_NO_CARTAO` em
-- apps/web/lib/acima-do-comum.ts). O limite de cada maquininha ("Parcelar no
-- crédito até") segue sendo a regra da venda (`recusaDasVezesDaRede`).
--
-- 1. As travas CHECK de 12 passam a 1.200: as taxas de antes (`payment_fees`,
--    o espelho da 1ª maquininha), o "Parcelar até" da maquininha e o de antes
--    (`tenants.cartao_max_vezes`), as vezes do lançamento e os recebíveis.
--    Todas as colunas são smallint/integer: 1.200 cabe.
-- 2. As funções que recusavam `> 12` passam a recusar `> 1200` (a mensagem
--    junto). Troca de trecho nos corpos VIVOS, com a conferência da contagem
--    (o padrão de 20261130100007).
-- 3. A taxa e os recebíveis cortavam as vezes em 12 (`least(12, …)`): o 18x
--    lia a taxa do 12x e nascia com 12 parcelas. Princípio 4 ("Faltou o dado,
--    vale zero e a tela avisa — nunca o valor de outro caso parecido"): a taxa
--    é a das vezes EXATAS, e sem ela vale 0% (como já era de 2x a 12x, F16-2);
--    os recebíveis são tantos quantas as vezes.
--
-- ADITIVA: só afrouxa travas e troca trechos; nenhuma linha gravada muda.

-- 1. As travas ------------------------------------------------------------------

alter table public.payment_fees
  drop constraint if exists payment_fees_check,
  add constraint payment_fees_check check (parcelas between 1 and 1200 and (metodo = 'CREDIT_CARD' or parcelas = 1));

alter table public.maquininhas
  drop constraint if exists maquininhas_max_vezes_check,
  add constraint maquininhas_max_vezes_check check (max_vezes between 1 and 1200);

alter table public.tenants
  drop constraint if exists tenants_cartao_max_vezes_check,
  add constraint tenants_cartao_max_vezes_check check (cartao_max_vezes is null or cartao_max_vezes between 1 and 1200);

alter table public.financial_transactions
  drop constraint if exists financial_transactions_cartao_vezes_check,
  add constraint financial_transactions_cartao_vezes_check
    check (cartao_vezes is null or (cartao_vezes between 2 and 1200 and payment_method = 'CREDIT_CARD'));

comment on column public.financial_transactions.cartao_vezes is
  'Cartão de crédito em N vezes (2 a 1.200; acima de 12 a tela avisa — o Heitor, 25/11), pago na hora. Nulo = à vista ou outro meio.';

alter table public.recebiveis_do_cartao
  drop constraint if exists recebiveis_do_cartao_check,
  add constraint recebiveis_do_cartao_check
    check (parcela_total >= 1 and parcela_total <= 1200 and parcela_numero <= parcela_total);

-- 2 e 3. Os corpos vivos ----------------------------------------------------------

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

-- O pagamento do atendimento (a forma única e cada uma das várias formas).
select pg_temp.trocar_no_corpo(
  'public.confirmar_pagamento_do_atendimento(uuid,uuid,uuid,text,jsonb)'::regprocedure,
  array[
    $t$v_vezes < 1 or v_vezes > 12 or$t$,
    $t$v_vezes_x < 1 or v_vezes_x > 12 or$t$,
    $t$'Parcelar na maquininha só no cartão de crédito, de 1 a 12 vezes.'$t$
  ],
  array[
    $t$v_vezes < 1 or v_vezes > 1200 or$t$,
    $t$v_vezes_x < 1 or v_vezes_x > 1200 or$t$,
    $t$'Parcelar na maquininha só no cartão de crédito, de 1 a 1.200 vezes.'$t$
  ],
  array[1, 1, 2]
);

-- O crédito na clínica vendido (a assinatura com a maquininha; as de antes a chamam).
select pg_temp.trocar_no_corpo(
  'public.credito_vender(uuid,uuid,uuid,numeric,text,integer,text,uuid,text,numeric,uuid)'::regprocedure,
  array[$t$v_vezes < 1 or v_vezes > 12 then$t$],
  array[$t$v_vezes < 1 or v_vezes > 1200 then$t$],
  array[1]
);

-- O pagamento novo do usado: pacote, plano, unidade pré-paga e produto devolvido.
select pg_temp.trocar_no_corpo(
  'public.pacote_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[$t$v_novo_vezes < 1 or v_novo_vezes > 12 or$t$, $t$'As vezes no cartão vão de 1 a 12, só no crédito.'$t$],
  array[$t$v_novo_vezes < 1 or v_novo_vezes > 1200 or$t$, $t$'As vezes no cartão vão de 1 a 1.200, só no crédito.'$t$],
  array[1, 1]
);

select pg_temp.trocar_no_corpo(
  'public.plano_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[$t$v_novo_vezes < 1 or v_novo_vezes > 12 or$t$, $t$'As vezes no cartão vão de 1 a 12, só no crédito.'$t$],
  array[$t$v_novo_vezes < 1 or v_novo_vezes > 1200 or$t$, $t$'As vezes no cartão vão de 1 a 1.200, só no crédito.'$t$],
  array[1, 1]
);

select pg_temp.trocar_no_corpo(
  'public.procedimento_cancelar_unidade_devolvendo(uuid,uuid,uuid,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[$t$v_novo_vezes < 1 or v_novo_vezes > 12 or$t$, $t$'As vezes no cartão vão de 1 a 12, só no crédito.'$t$],
  array[$t$v_novo_vezes < 1 or v_novo_vezes > 1200 or$t$, $t$'As vezes no cartão vão de 1 a 1.200, só no crédito.'$t$],
  array[1, 1]
);

select pg_temp.trocar_no_corpo(
  'public.produto_devolver_itens(uuid,uuid,uuid,text,text,jsonb,boolean,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[$t$v_novo_vezes < 1 or v_novo_vezes > 12 or$t$, $t$'As vezes no cartão vão de 1 a 12, só no crédito.'$t$],
  array[$t$v_novo_vezes < 1 or v_novo_vezes > 1200 or$t$, $t$'As vezes no cartão vão de 1 a 1.200, só no crédito.'$t$],
  array[1, 1]
);

-- A taxa da maquininha: a das vezes EXATAS (o 18x sem taxa cadastrada é nula,
-- e `comissao_taxa_pct` a faz 0%) — nunca a do 12x.
select pg_temp.trocar_no_corpo(
  'private.taxa_da_maquininha(uuid,text,integer,text,uuid)'::regprocedure,
  array[$t$greatest(1, least(12, coalesce(p_parcelas, 1)))$t$],
  array[$t$greatest(1, coalesce(p_parcelas, 1))$t$],
  array[1]
);

-- Os recebíveis da operadora: tantos quantas as vezes, com a taxa daquelas vezes.
select pg_temp.trocar_no_corpo(
  'private.recebiveis_do_cartao_acompanham()'::regprocedure,
  array[$t$least(12, coalesce(new.cartao_vezes, 1))$t$],
  array[$t$coalesce(new.cartao_vezes, 1)$t$],
  array[2]
);

-- As vendas sem taxa do Financeiro: o 18x sem taxa aparece como "Crédito 18x".
select pg_temp.trocar_no_corpo(
  'public.metrics_vendas_sem_taxa_do_fechamento(uuid,uuid,timestamp with time zone,timestamp with time zone)'::regprocedure,
  array[$t$least(12, coalesce(r.cartao_vezes, 1))$t$],
  array[$t$coalesce(r.cartao_vezes, 1)$t$],
  array[1]
);

drop function pg_temp.trocar_no_corpo(regprocedure, text[], text[], int[]);

-- Quem só o servidor chama segue só do servidor (o create or replace mantém os
-- grants; reafirmado).
revoke execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;
revoke execute on function public.credito_vender(uuid, uuid, uuid, numeric, text, integer, text, uuid, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.credito_vender(uuid, uuid, uuid, numeric, text, integer, text, uuid, text, numeric, uuid) to service_role;
revoke execute on function public.metrics_vendas_sem_taxa_do_fechamento(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_vendas_sem_taxa_do_fechamento(uuid, uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
