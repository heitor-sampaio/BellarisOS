-- "A receber" e "A pagar" pelo vencimento, com o próximo (A34 da simulação de
-- 2026-10-27).
--
-- O financeiro mostrava "A pagar R$ 0" em "Este mês" com uma conta de R$ 300
-- vencendo em 05/11, sem dizer que o período é o do vencimento. Esta função
-- dá, para o período, os dois em aberto pela data de referência (o vencimento;
-- sem ele, a criação — a regra de metrics_core e metrics_a_pagar) e, depois do
-- fim dele, o PRÓXIMO vencimento de cada lado: o dia (Brasília) e a soma do
-- que vence nele. Estorno fora dos dois lados, como em todo o financeiro.
--
-- O "A receber" das telas do financeiro passa a valer até o FIM do período,
-- como o "A pagar": ia só até agora (a janela decorrida do delta), e a parcela
-- que vence no fim do mês ficava de fora.

create or replace function public.metrics_em_aberto(p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (
  a_receber numeric, a_pagar numeric,
  proximo_receber_dia date, proximo_receber_valor numeric,
  proximo_pagar_dia date, proximo_pagar_valor numeric
)
language sql
stable
set search_path = ''
as $fn$
  with aberto as (
    select t.type::text tipo, t.amount, t.data_de_referencia ref,
           (t.data_de_referencia at time zone 'America/Sao_Paulo')::date dia
      from public.financial_transactions t
      join public.branches b on b.id = t.branch_id
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
       and not t.is_paid
       and t.amount <> 0  -- o saldo zerado (substituído no check-in) é histórico
       and coalesce(t.notes, '')    <> 'Estornada'
       and coalesce(t.category, '') <> 'Estorno'
  ),
  proximo as (
    select tipo, min(dia) dia from aberto where ref > p_to group by tipo
  )
  select
    coalesce((select round(sum(amount), 2) from aberto where tipo = 'INCOME'  and ref between p_from and p_to), 0),
    coalesce((select round(sum(amount), 2) from aberto where tipo = 'EXPENSE' and ref between p_from and p_to), 0),
    (select dia from proximo where tipo = 'INCOME'),
    (select round(sum(a.amount), 2) from aberto a join proximo p on p.tipo = a.tipo and p.dia = a.dia
      where a.tipo = 'INCOME' and a.ref > p_to),
    (select dia from proximo where tipo = 'EXPENSE'),
    (select round(sum(a.amount), 2) from aberto a join proximo p on p.tipo = a.tipo and p.dia = a.dia
      where a.tipo = 'EXPENSE' and a.ref > p_to)
$fn$;

revoke all on function public.metrics_em_aberto(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_em_aberto(uuid, uuid[], timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
