-- A17 da 30ª simulação (vendas-financeiro:FN-11; princípio 3): o cartão
-- "A receber da cliente · em aberto" soma TODO o em aberto, inclusive o
-- lançamento SEM cliente (a sublocação da sala, um aluguel) — e a tela não
-- dizia. Esta função conta essa parte, com o MESMO conjunto de
-- metrics_a_receber_em_aberto (receita, em aberto, não estornada), só o que
-- não tem cliente nem atendimento. A nota do cartão diz "Inclui sem cliente:
-- R$ …". O número grande não muda (a FN-11 diz "todo o em aberto"): tirar a
-- sublocação dele é pergunta ao Heitor.
-- No total e por unidade (grouping sets, como as outras do em aberto).

create or replace function public.metrics_a_receber_sem_cliente(p_tenant uuid, p_branch_ids uuid[])
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
     and t.client_id is null
     and t.appointment_id is null
   group by grouping sets ((t.branch_id), ())
$function$;

revoke execute on function public.metrics_a_receber_sem_cliente(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.metrics_a_receber_sem_cliente(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
