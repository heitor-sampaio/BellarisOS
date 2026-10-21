-- A composição do financeiro, contada no banco (2026-10-21).
--
-- A tela do financeiro somava a LISTA de lançamentos para as "Categorias de
-- despesa/receita" e as formas de pagamento — tirando só a transação marcada
-- "Estornada": a contra-transação (categoria "Estorno") entrava como despesa,
-- e as categorias somavam R$ 6.950 contra o KPI de R$ 6.900 (simulação de um
-- dia de clínica, 2026-10-20). E somar a lista é somar no máximo 1000 linhas.
--
-- Mesma regra de metrics_core: pago, no período por coalesce(paid_at,
-- created_at), estorno fora dos DOIS lados, unidades da rede.

create or replace function public.metrics_financeiro_composicao(p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz)
 returns table(grupo text, chave text, valor numeric)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with t as (
    select f.type::text as tipo, f.category, f.payment_method::text as forma, f.amount
      from public.financial_transactions f
      join public.branches b on b.id = f.branch_id
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
       and f.is_paid
       and coalesce(f.notes, '')    <> 'Estornada'
       and coalesce(f.category, '') <> 'Estorno'
       and coalesce(f.paid_at, f.created_at) between p_from and p_to
  )
  select 'FORMA', forma, round(sum(amount), 2) from t where tipo = 'INCOME' and forma is not null group by forma
  union all
  select 'RECEITA', coalesce(category, 'Sem categoria'), round(sum(amount), 2) from t where tipo = 'INCOME' group by 2
  union all
  select 'DESPESA', coalesce(category, 'Sem categoria'), round(sum(amount), 2) from t where tipo = 'EXPENSE' group by 2
$function$;

revoke execute on function public.metrics_financeiro_composicao(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_financeiro_composicao(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
