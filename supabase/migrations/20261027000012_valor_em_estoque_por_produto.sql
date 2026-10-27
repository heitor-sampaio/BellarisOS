-- O valor de cada produto na tela de estoque (A39, 2026-10-27): por unidade e,
-- com `branch_id` nulo, o do produto nas unidades dadas — a soma é do banco,
-- não da tela. A mesma conta de metrics_valor_em_estoque (valor_do_saldo:
-- saldo em consumo × custo de consumo).
create or replace function public.metrics_valor_em_estoque_por_produto(p_branch_ids uuid[])
 returns table (product_id uuid, branch_id uuid, valor numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select s.product_id, s.branch_id, sum(public.valor_do_saldo(s, pr))
  from public.branch_product_stock s
  join public.products pr on pr.id = s.product_id
  where s.branch_id = any (p_branch_ids)
  group by grouping sets ((s.product_id, s.branch_id), (s.product_id));
$function$;

notify pgrst, 'reload schema';
