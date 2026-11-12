-- C43 do levantamento das regras (F67, 2026-11-12; D14, o Heitor, 2026-11-11):
-- o pacote e o pré-pago no crediário pontuam CUMULATIVOS, como o plano. No
-- modo "por real", cada parcela arredondava para baixo sozinha (3 × R$ 33,33
-- davam 99 pontos de R$ 100). Agora cada pagamento dá o alvo — floor(o pago
-- da venda × pontos por real) — menos o que a venda já deu. O modo "por
-- procedimento" já era assim.

do $$
declare
  v_def  text;
  v_novo text;
begin
  select pg_get_functiondef('public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs)'::regprocedure)
    into v_def;
  v_novo := replace(v_def,
    E'  if p_tx.treatment_plan_id is not null then\n    select coalesce(sum(p.price), 0)',
    E'  -- C43: por real, o pacote e o pré-pago também são cumulativos.\n'
    || E'  if p_tx.procedure_sale_id is not null or p_tx.client_package_id is not null then\n'
    || E'    select coalesce(sum(f.amount), 0) into v_pago\n'
    || E'      from public.financial_transactions f\n'
    || E'     where ((p_tx.procedure_sale_id is not null and f.procedure_sale_id = p_tx.procedure_sale_id)\n'
    || E'         or (p_tx.procedure_sale_id is null and f.client_package_id = p_tx.client_package_id))\n'
    || E'       and f.type = ''INCOME'' and f.is_paid\n'
    || E'       and f.category <> ''Estorno'' and coalesce(f.notes, '''') <> ''Estornada''\n'
    || E'       and f.payment_method is distinct from ''INTERNAL_CREDIT'';\n'
    || E'    select coalesce(sum(l.points), 0)::int into v_ja\n'
    || E'      from public.loyalty_transactions l\n'
    || E'      join public.financial_transactions f on f.id = l.transaction_id\n'
    || E'     where ((p_tx.procedure_sale_id is not null and f.procedure_sale_id = p_tx.procedure_sale_id)\n'
    || E'         or (p_tx.procedure_sale_id is null and f.client_package_id = p_tx.client_package_id))\n'
    || E'       and l.kind in (''GANHO'', ''ESTORNO_GANHO'');\n'
    || E'    v_alvo := floor(v_pago * p_cfg.points_per_real)::int;\n'
    || E'    return greatest(v_alvo - v_ja, 0);\n'
    || E'  end if;\n\n'
    || E'  if p_tx.treatment_plan_id is not null then\n    select coalesce(sum(p.price), 0)');
  if v_novo = v_def then
    raise exception 'C43: o corpo de fidelidade_pontos_do_pagamento não é o esperado';
  end if;
  execute v_novo;
end
$$;

notify pgrst, 'reload schema';
