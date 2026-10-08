-- O estoque crítico para o Copilot (2026-10-08, revisão da fase 3): saldo
-- <= mínimo (a régua da tela e de metrics_relatorio.criticos), comparando as
-- duas colunas NO BANCO. Ler e filtrar no app cortava em N linhas antes do
-- filtro e perdia itens. Só o servidor chama (service_role).

create or replace function public.copilot_estoque_critico(p_tenant uuid, p_branch_ids uuid[], p_limite integer default 60)
returns table(product_id uuid, name text, unit text, branch_id uuid, current_stock numeric, min_stock numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.unit, s.branch_id, s.current_stock, s.min_stock
  from public.branch_product_stock s
  join public.products p on p.id = s.product_id
  where p.tenant_id = p_tenant
    and p.is_active
    and s.branch_id = any(p_branch_ids)
    and coalesce(s.min_stock, 0) > 0
    and s.current_stock <= s.min_stock
  order by (s.current_stock / nullif(s.min_stock, 0)), p.name
  limit greatest(1, least(coalesce(p_limite, 60), 200));
$$;

revoke execute on function public.copilot_estoque_critico(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.copilot_estoque_critico(uuid, uuid[], integer) to service_role;

notify pgrst, 'reload schema';
