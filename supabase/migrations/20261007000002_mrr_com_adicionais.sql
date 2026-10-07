-- O MRR do painel do sistema conta os ADICIONAIS (2026-10-07): a receita
-- recorrente é a mensalidade inteira — valor_total_centavos (plano +
-- adicionais), não valor_centavos (só a base). A "sem cobrança" também olha o
-- total. Mesmo método da 20261006000004: troca o trecho na definição do banco
-- e falha se ele mudou.
do $$
declare
  v_antes text;
  v_depois text;
begin
  v_antes := pg_get_functiondef('public.plataforma_indicadores(boolean)'::regprocedure);
  v_depois := replace(v_antes,
    $x$'mrr_centavos', (select coalesce(sum(s.valor_centavos), 0)$x$,
    $x$'mrr_centavos', (select coalesce(sum(s.valor_total_centavos), 0)$x$);
  v_depois := replace(v_depois,
    $x$and s.valor_centavos > 0$x$,
    $x$and s.valor_total_centavos > 0$x$);
  if v_depois = v_antes or position('sum(s.valor_centavos)' in v_depois) > 0 then
    raise exception 'plataforma_indicadores: o trecho de referência mudou';
  end if;
  execute v_depois;
end $$;

notify pgrst, 'reload schema';
