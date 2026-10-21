-- As movimentações do financeiro da rede, contadas no banco com a regra da
-- LISTA (2026-10-21): data de referência no período (o pago no pagamento, o
-- em aberto no vencimento) e sem o saldo zerado. Uma linha por unidade e uma
-- de total (branch_id nulo). Até aqui a coluna da unidade contava pela data
-- de pagamento até agora (metrics_by_branch) e o total era o tamanho da
-- lista exibida (com teto de 500): "9" contra "6" (D34 da simulação).

create or replace function public.metrics_movimentacoes(p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz)
 returns table(branch_id uuid, n bigint)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select t.branch_id, count(*)
    from public.financial_transactions t
    join public.branches b on b.id = t.branch_id
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or b.id = any (p_branch_ids))
     and (t.is_paid or t.amount <> 0)
     and t.data_de_referencia between p_from and p_to
   group by grouping sets ((t.branch_id), ())
$function$;

revoke execute on function public.metrics_movimentacoes(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_movimentacoes(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
