-- O "+ Outra forma" sem limite de quantidade. O Heitor, 25/11, perguntado se o
-- limite de 5 formas num pagamento continua ou passa a avisar acima de 5: "Não
-- precisa de aviso, essa não é uma ação automatica, o usuario vai precisar
-- clicar em um botão, então ele fez de proposito."
--
-- Cada forma a mais é um clique de quem recebe: o banco aceita quantas formas
-- vierem, sem aviso. Fica só o impossível, que já estava nas duas funções: cada
-- forma com valor acima de zero (R$ 0,01) e as formas fechando o total ao
-- centavo. Sem limite técnico: cada forma é uma linha de financial_transactions
-- (nenhuma coluna numera as formas), e o laço é sobre o que veio.
--
-- 1. O "Receber" da parcela e do a receber em formas (`lancamento_receber_em_formas`,
--    a de 20261122200001, nunca trocada depois): recusava "2 a 5 formas". Fica
--    "pelo menos 2" — com uma só é a baixa de sempre (`marcarPagoCore`).
-- 2. O pagamento da comanda do atendimento (`confirmar_pagamento_do_atendimento`,
--    a de 20261121000001, com trechos trocados em 20261124000001 e 20261206800001,
--    nenhum neste): recusava mais de 30 LANÇAMENTOS com "Formas demais neste
--    pagamento." — e o crediário são a entrada mais uma linha por parcela, então a
--    comanda em 30x com entrada (31 lançamentos) não fechava, com uma mensagem que
--    falava em "formas". As formas pagas agora passam a não ter teto; as parcelas
--    (os lançamentos que não se pagam agora) seguem o teto do crediário, 32.767
--    (`TETO_DO_CREDIARIO` = `LIMITE_DO_INTEIRO_CURTO`, apps/web/lib/financeiro/
--    parcelas-do-crediario.ts: uma linha por parcela — decisão do Claude, 25/11),
--    com a recusa do registro ("No máximo 32.767 parcelas (o limite do registro).").
--
-- Troca de trecho nos corpos VIVOS, com a conferência da contagem (o padrão de
-- 20261206800001). ADITIVA: só afrouxa travas; nenhuma linha gravada muda.

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

-- 1. O "Receber" em formas: pelo menos duas, e nenhum teto.
select pg_temp.trocar_no_corpo(
  'public.lancamento_receber_em_formas(uuid,uuid,jsonb,uuid)'::regprocedure,
  array[
    $t$if v_n < 2 or v_n > 5 then$t$,
    $t$'Divida em 2 a 5 formas.'$t$
  ],
  array[
    $t$if v_n < 2 then$t$,
    $t$'Divida em pelo menos 2 formas.'$t$
  ],
  array[1, 1]
);

-- 2. A comanda do atendimento: as formas sem teto; as parcelas, o do crediário.
select pg_temp.trocar_no_corpo(
  'public.confirmar_pagamento_do_atendimento(uuid,uuid,uuid,text,jsonb)'::regprocedure,
  array[
    $t$  if jsonb_array_length(v_l) > 30 then
    raise exception 'Formas demais neste pagamento.' using errcode = 'P0001';
  end if;$t$
  ],
  array[
    $t$  -- As formas pagas agora: quantas vierem (o Heitor, 25/11: "o usuario vai
  -- precisar clicar em um botão, então ele fez de proposito"). As parcelas do
  -- crediário (o que não se paga agora): o teto do crediário, uma linha por parcela.
  if (select count(*) from jsonb_array_elements(v_l) x where not coalesce((x ->> 'is_paid')::boolean, false)) > 32767 then
    raise exception 'No máximo 32.767 parcelas (o limite do registro).' using errcode = 'P0001';
  end if;$t$
  ],
  array[1]
);

drop function pg_temp.trocar_no_corpo(regprocedure, text[], text[], int[]);

-- Quem só o servidor chama segue só do servidor (o create or replace mantém os
-- grants; reafirmado).
revoke execute on function public.lancamento_receber_em_formas(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.lancamento_receber_em_formas(uuid, uuid, jsonb, uuid) to service_role;
revoke execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
