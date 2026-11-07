-- Sobra da F40 (a 2ª unidade da 9ª simulação, 2026-11-07): o preço da unidade
-- passou a valer em todo caminho de preço (D2, `private.preco_na_unidade`),
-- mas a margem do procedimento (`metrics_margem_procedimentos`) seguia com o
-- preço e a mão de obra da REDE — a criolipólise de R$ 590 na Menino Deus
-- aparecia com a margem dos R$ 650. Recortada a uma unidade, a margem usa o
-- preço DELA e a mão de obra dela (`procedure_branch_pricing.labor_cost`, que
-- o cadastro já gravava); o insumo e os outros custos são os do catálogo. O
-- custo é o de `metrics_custo_dos_procedimentos` (a conta UMA), com a mão de
-- obra trocada pela da unidade quando ela tem a sua. A rede inteira segue a
-- função de antes (o catálogo).

create or replace function public.metrics_margem_procedimentos_na_unidade(p_tenant uuid, p_unidade uuid, p_limit integer default 5)
returns table(procedure_id uuid, procedure_name text, price numeric, cost numeric, margin_pct numeric)
language sql
stable
security definer
set search_path to ''
as $$
  with custos as (
    select pr.id, pr.name,
           private.preco_na_unidade(pr.id, p_unidade) as price,
           round(c.custo - coalesce(pr.labor_cost, 0) + coalesce(bp.labor_cost, pr.labor_cost, 0), 2) as cost
      from public.procedures pr
      join public.metrics_custo_dos_procedimentos(p_tenant) c on c.procedure_id = pr.id
      left join public.procedure_branch_pricing bp on bp.procedure_id = pr.id and bp.branch_id = p_unidade
     where pr.tenant_id = p_tenant and coalesce(pr.is_active, true)
       and exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant)
  )
  select id, name, price, cost, round((price - cost) / price * 100, 2)
    from custos
   -- A13: sem custo cadastrado, não há margem a mostrar (seria 100%).
   where price > 0 and cost > 0
   order by (price - cost) / price desc, name
   limit greatest(1, least(coalesce(p_limit, 5), 100))
$$;

revoke execute on function public.metrics_margem_procedimentos_na_unidade(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.metrics_margem_procedimentos_na_unidade(uuid, uuid, integer) to service_role;

notify pgrst, 'reload schema';
