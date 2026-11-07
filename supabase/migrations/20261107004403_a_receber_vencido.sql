-- D13 da 9ª simulação (2026-11-07; decidido pelo princípio 3): a parcela
-- VENCIDA aparecia como "Pendente", igual à que vai vencer, em toda tela — o
-- Financeiro, a ficha, o dashboard e o app. A 1ª parcela da Mariana venceu em
-- 05/11 e ninguém via. A tela passa a dizer "Vencida em 05/11"; o cartão "A
-- receber da cliente" e o dashboard dizem quanto está vencido, e o check-in
-- avisa. A conta é UMA, aqui: o a receber da cliente em aberto (o conjunto de
-- `metrics_a_receber_em_aberto`) com o vencimento ANTES de hoje no fuso da
-- clínica — o que vence hoje ainda não venceu.

create or replace function public.metrics_a_receber_vencido(
  p_tenant uuid, p_branch_ids uuid[], p_professional_id uuid default null, p_client uuid default null
) returns table(branch_id uuid, valor numeric, quantidade bigint, mais_antiga timestamptz)
language sql
stable
set search_path to ''
as $$
  select t.branch_id, coalesce(round(sum(t.amount), 2), 0), count(*), min(t.due_date)
    from public.financial_transactions t
    join public.branches b on b.id = t.branch_id
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or b.id = any (p_branch_ids))
     and t.type = 'INCOME'
     and not t.is_paid
     and t.amount > 0
     and coalesce(t.notes, '')    <> 'Estornada'
     and coalesce(t.category, '') <> 'Estorno'
     and t.due_date is not null
     and t.due_date < (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
     and (p_client is null or t.client_id = p_client)
     and (p_professional_id is null or exists (
           select 1 from public.appointments a
            where a.id = t.appointment_id and a.professional_id = p_professional_id))
   group by grouping sets ((t.branch_id), ())
$$;

revoke execute on function public.metrics_a_receber_vencido(uuid, uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.metrics_a_receber_vencido(uuid, uuid[], uuid, uuid) to service_role;

notify pgrst, 'reload schema';
