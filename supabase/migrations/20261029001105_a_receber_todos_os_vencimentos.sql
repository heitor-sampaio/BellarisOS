-- D-14 (decisão do Heitor, 2026-10-29): o cartão "A receber" mantém o número
-- do mês (metrics_em_aberto, pelo vencimento), e abaixo vem a linha "Em
-- aberto, todos os vencimentos: R$ X" — todas as parcelas e recebíveis em
-- aberto, de QUALQUER vencimento.
--
-- O mesmo conjunto do "a receber" de metrics_em_aberto, sem a janela: INCOME
-- não pago, sem o saldo zerado (substituído no check-in) e sem estorno dos
-- dois lados. Por unidade e o total (branch_id nulo). Com p_professional_id
-- (o financeiro "só os meus"), o recebível ligado a um atendimento dela — o
-- predicado do dinheiro de metrics_core.
-- Função nova, só service_role.

create or replace function public.metrics_a_receber_em_aberto(p_tenant uuid, p_branch_ids uuid[], p_professional_id uuid default null)
 returns table(branch_id uuid, valor numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select t.branch_id, coalesce(round(sum(t.amount), 2), 0)
    from public.financial_transactions t
    join public.branches b on b.id = t.branch_id
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or b.id = any (p_branch_ids))
     and t.type = 'INCOME'
     and not t.is_paid
     and t.amount <> 0
     and coalesce(t.notes, '')    <> 'Estornada'
     and coalesce(t.category, '') <> 'Estorno'
     and (p_professional_id is null or exists (
           select 1 from public.appointments a
            where a.id = t.appointment_id and a.professional_id = p_professional_id))
   group by grouping sets ((t.branch_id), ())
$function$;

revoke all on function public.metrics_a_receber_em_aberto(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.metrics_a_receber_em_aberto(uuid, uuid[], uuid) to service_role;

notify pgrst, 'reload schema';
