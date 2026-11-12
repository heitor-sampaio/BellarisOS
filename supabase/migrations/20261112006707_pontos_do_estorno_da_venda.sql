-- C43 (F67), complemento: o "o que a venda já deu" conta o ESTORNO_GANHO.
--
-- O estorno grava o ESTORNO_GANHO no contra-lançamento (category 'Estorno'),
-- que não leva o pacote nem o pré-pago — só `estorno_de`. A conta cumulativa
-- do pacote e do pré-pago (por real, desde a 20261112006706; por procedimento,
-- de antes) somava o GANHO e não via o estorno dele: no cancelamento que
-- "estorna o pagamento inteiro e lança o usado de novo", o usado não pontuava
-- (pacote-cancelar.spec.ts, r2-ven-05). Agora o lançamento conta pela venda
-- dele OU pela do lançamento que ele estornou.

do $$
declare
  v_def  text;
  v_novo text;
  v_de   text := E'      join public.financial_transactions f on f.id = l.transaction_id\n'
              || E'     where ((p_tx.procedure_sale_id is not null and f.procedure_sale_id = p_tx.procedure_sale_id)\n'
              || E'         or (p_tx.procedure_sale_id is null and f.client_package_id = p_tx.client_package_id))\n'
              || E'       and l.kind in (''GANHO'', ''ESTORNO_GANHO'');';
  v_para text := E'      join public.financial_transactions f on f.id = l.transaction_id\n'
              || E'      left join public.financial_transactions o on o.id = f.estorno_de\n'
              || E'     where ((p_tx.procedure_sale_id is not null and coalesce(f.procedure_sale_id, o.procedure_sale_id) = p_tx.procedure_sale_id)\n'
              || E'         or (p_tx.procedure_sale_id is null and coalesce(f.client_package_id, o.client_package_id) = p_tx.client_package_id))\n'
              || E'       and l.kind in (''GANHO'', ''ESTORNO_GANHO'');';
begin
  select pg_get_functiondef('public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs)'::regprocedure)
    into v_def;
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 2 then
    raise exception 'C43: o corpo de fidelidade_pontos_do_pagamento não é o esperado';
  end if;
  v_novo := replace(v_def, v_de, v_para);
  execute v_novo;
end
$$;

notify pgrst, 'reload schema';
