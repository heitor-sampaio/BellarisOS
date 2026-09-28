-- Receita dos atendimentos concluídos por CATEGORIA do procedimento (aba
-- Procedimentos dos relatórios). A tela reagrupava a lista por procedimento
-- somando em JS — mesma regra, mas "nenhuma tela soma dinheiro" (§13.1).
-- Receita = preço do atendimento, a serviceRevenue de metrics_core.

create or replace function public.metrics_receita_por_categoria_de_procedimento(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
)
returns table (categoria text, receita numeric)
language sql
stable
set search_path = ''
as $fn$
  select coalesce(pr.category, '—'), sum(coalesce(a.price, 0))
  from public.appointments a
  join public.procedures pr on pr.id = a.procedure_id
  join public.branches b on b.id = a.branch_id
  where b.tenant_id = p_tenant
    and (p_branch_ids is null or b.id = any (p_branch_ids))
    and a.status = 'COMPLETED'
    and a.scheduled_at between p_from and p_to
  group by 1;
$fn$;

revoke all on function public.metrics_receita_por_categoria_de_procedimento(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_receita_por_categoria_de_procedimento(uuid, uuid[], timestamptz, timestamptz) to service_role;
