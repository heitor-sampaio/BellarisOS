-- D17 da simulação de 2026-10-28: Relatórios → Estoque, "Valor em estoque por
-- categoria", dizia "Sem dados no período" com R$ 5.562 em estoque — o
-- produto sem categoria saía da conta (`where category is not null`, desde a
-- migration 20261027000023). Decisão do Heitor: o produto sem categoria (ou
-- com a categoria em branco) entra numa fatia "Sem categoria", e as fatias
-- somam o valor em estoque da mesma aba.
--
-- A função é a `metrics_relatorio`, grande e recriada por várias frentes: a
-- mudança parte do corpo ATUAL da produção (pg_get_functiondef) e troca só o
-- trecho da categoria — se ele não estiver lá do jeito esperado, a migration
-- para em vez de recriar a função de um arquivo antigo.

do $$
declare
  v_antes  text;
  v_depois text;
begin
  v_antes := pg_get_functiondef('public.metrics_relatorio(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, text, text)'::regprocedure);
  v_depois := regexp_replace(v_antes,
    'select category, sum\(valor\) v from saldo\s+where category is not null group by category\)',
    'select coalesce(nullif(btrim(category), ''''), ''Sem categoria'') as category, sum(valor) v from saldo group by 1)');
  if v_depois = v_antes then
    raise exception 'metrics_relatorio: o trecho do valor por categoria mudou';
  end if;
  if v_depois ~ 'from saldo\s+where category is not null' then
    raise exception 'metrics_relatorio: sobrou um recorte de categoria no estoque';
  end if;
  execute v_depois;
end $$;

notify pgrst, 'reload schema';
