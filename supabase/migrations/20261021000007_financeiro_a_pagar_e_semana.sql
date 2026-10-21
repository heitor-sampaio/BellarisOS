-- O financeiro da unidade deixa de somar a lista na tela (2026-10-21; §13.1):
-- - metrics_series aceita 'week' (o gráfico do trimestre era por semana,
--   somado no navegador);
-- - metrics_a_pagar: a despesa em aberto do período (data de referência = o
--   vencimento), sem estorno — o cartão "A pagar" somava a lista.

create or replace function public.metrics_series(p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz, p_granularity text default 'day'::text)
 returns table(bucket timestamptz, revenue numeric, expenses numeric)
 language sql
 stable
as $function$
  with scope as (
    select b.id
    from public.branches b
    where b.tenant_id = p_tenant
      and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  tx as (
    select
      date_trunc(
        case when p_granularity in ('hour', 'day', 'week', 'month') then p_granularity else 'day' end,
        coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo'
      ) at time zone 'America/Sao_Paulo' as bucket,
      t.type,
      t.amount
    from public.financial_transactions t
    join scope s on s.id = t.branch_id
    where t.is_paid
      and coalesce(t.notes, '')    <> 'Estornada'
      and coalesce(t.category, '') <> 'Estorno'
      and coalesce(t.paid_at, t.created_at) between p_from and p_to
  )
  select
    tx.bucket,
    coalesce(sum(tx.amount) filter (where tx.type = 'INCOME'), 0),
    coalesce(sum(tx.amount) filter (where tx.type = 'EXPENSE'), 0)
  from tx
  group by tx.bucket
  order by tx.bucket;
$function$;

create or replace function public.metrics_a_pagar(p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz)
 returns numeric
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(round(sum(t.amount), 2), 0)
    from public.financial_transactions t
    join public.branches b on b.id = t.branch_id
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or b.id = any (p_branch_ids))
     and t.type = 'EXPENSE' and not t.is_paid
     and coalesce(t.notes, '')    <> 'Estornada'
     and coalesce(t.category, '') <> 'Estorno'
     and t.data_de_referencia between p_from and p_to
$function$;

revoke execute on function public.metrics_a_pagar(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_a_pagar(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
