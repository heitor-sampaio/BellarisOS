-- D4 da 21ª simulação (2026-11-17; princípio 3): a agenda dizia "JÁ PAGO · 4
-- limpezas · sessão 2 de 4" com R$ 600 do pacote no crediário em aberto, e o
-- mesmo valia para o pré-pago e o plano vendidos em parcelas. O em aberto de
-- cada venda — o pacote, o pré-pago ou o plano —, pelo id dela: a mesma régua
-- de `metrics_em_aberto_dos_pacotes` (a receita em aberto, viva, da rede).

create or replace function public.metrics_em_aberto_das_vendas(p_tenant uuid, p_vendas uuid[])
returns table(venda_id uuid, em_aberto numeric, parcelas integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.venda_id, round(sum(v.amount), 2), count(*)::integer
    from (
      select coalesce(
               case when f.client_package_id = any (p_vendas) then f.client_package_id end,
               case when f.procedure_sale_id = any (p_vendas) then f.procedure_sale_id end,
               case when f.treatment_plan_id = any (p_vendas) then f.treatment_plan_id end
             ) as venda_id, f.amount
        from public.financial_transactions f
        join public.branches b on b.id = f.branch_id and b.tenant_id = p_tenant
       where (f.client_package_id = any (p_vendas) or f.procedure_sale_id = any (p_vendas) or f.treatment_plan_id = any (p_vendas))
         and f.type = 'INCOME' and not f.is_paid and f.amount > 0
         and coalesce(f.notes, '') <> 'Estornada'
    ) v
   group by v.venda_id
$$;

revoke execute on function public.metrics_em_aberto_das_vendas(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.metrics_em_aberto_das_vendas(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
