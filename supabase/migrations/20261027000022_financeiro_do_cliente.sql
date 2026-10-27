-- Os totais da aba Financeiro da ficha da cliente (D6 da simulação de
-- 2026-10-27, decisão do Heitor).
--
-- A aba somava na tela as linhas que tinha carregado (as últimas 50) e
-- mostrava à Profissional — `financial: Ver, só os próprios`, que existe para
-- ela ver as comissões DELA — o total pago e a receber de todos os
-- atendimentos da cliente. Agora os totais vêm daqui, e `p_profissional`
-- recorta pelos atendimentos de quem atendeu:
--
-- - pago: a regra de receita de sempre (metrics_receitas_pagas: INCOME pago,
--   sem estorno dos dois lados) — o mesmo LTV do cabeçalho da ficha;
-- - a_receber: os lançamentos em aberto MAIS os atendimentos concluídos a
--   receber que ainda não têm lançamento (atendimentos_a_receber, D5);
-- - credito: o saldo de crédito interno — nulo no "só os próprios" (o
--   crédito é da cliente, não de um atendimento).

create or replace function public.metrics_financeiro_do_cliente(
  p_tenant uuid, p_client uuid, p_profissional uuid default null
)
returns table (pago numeric, a_receber numeric, credito numeric)
language sql
stable
set search_path = ''
as $fn$
  select
    coalesce((
      select round(sum(t.amount), 2)
        from public.metrics_receitas_pagas(p_tenant, null, '2000-01-01'::timestamptz, 'infinity'::timestamptz) t
       where t.client_id = p_client
         and (p_profissional is null or exists (
               select 1 from public.appointments a
                where a.id = t.appointment_id and a.professional_id = p_profissional))
    ), 0),
    coalesce((
      select round(sum(t.amount), 2)
        from public.financial_transactions t
        join public.branches b on b.id = t.branch_id
       where b.tenant_id = p_tenant and t.client_id = p_client
         and t.type = 'INCOME' and not t.is_paid
         and coalesce(t.notes, '')    <> 'Estornada'
         and coalesce(t.category, '') <> 'Estorno'
         and (p_profissional is null or exists (
               select 1 from public.appointments a
                where a.id = t.appointment_id and a.professional_id = p_profissional))
    ), 0)
    + coalesce((
      select round(sum(r.price), 2)
        from public.atendimentos_a_receber(p_tenant, null, p_client, null, p_profissional) r
       where not exists (select 1 from public.financial_transactions f where f.appointment_id = r.appointment_id)
    ), 0),
    case when p_profissional is null then coalesce((
      select round(sum(c.amount), 2) from public.internal_credits c where c.client_id = p_client
    ), 0) end
$fn$;

revoke all on function public.metrics_financeiro_do_cliente(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.metrics_financeiro_do_cliente(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
