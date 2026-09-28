-- Os dois últimos lugares que somavam dinheiro na tela (CLAUDE.md §13.1).
--
-- 1. Ficha do cliente (os dois portais) e "Total investido" do portal do
--    cliente: o LTV era "preço dos atendimentos concluídos + lançamentos pagos
--    sem agendamento", somado no JS — uma SEGUNDA definição de LTV, ao lado da
--    do dashboard (metrics_top_clients: o que o cliente PAGOU), que ainda
--    contava lançamento estornado e atendimento concluído que nunca foi pago.
--    E o "ticket médio" da ficha dividia isso por (sessões + lançamentos) —
--    uma terceira conta de ticket. Agora: LTV = receita paga do cliente, desde
--    sempre, do conjunto canônico (metrics_receitas_pagas); ticket = receita
--    dos atendimentos concluídos ÷ atendimentos concluídos, a regra do sistema
--    recortada no cliente.
--
-- 2. Valor em estoque (telas de estoque): soma de custo × saldo feita sobre a
--    lista no JS.

create or replace function public.metrics_do_cliente(p_tenant uuid, p_client uuid)
returns jsonb
language sql
stable
set search_path = ''
as $fn$
  select jsonb_build_object(
    'ltv', coalesce((
      select sum(t.amount)
      from public.metrics_receitas_pagas(p_tenant, null, '2000-01-01'::timestamptz, 'infinity'::timestamptz) t
      where t.client_id = p_client
    ), 0),
    'atendimentos', (
      select count(*) from public.appointments a
      join public.branches b on b.id = a.branch_id
      where b.tenant_id = p_tenant and a.client_id = p_client and a.status = 'COMPLETED'
    ),
    'receita_servico', coalesce((
      select sum(coalesce(a.price, 0)) from public.appointments a
      join public.branches b on b.id = a.branch_id
      where b.tenant_id = p_tenant and a.client_id = p_client and a.status = 'COMPLETED'
    ), 0)
  );
$fn$;

create or replace function public.metrics_valor_em_estoque(p_branch_ids uuid[])
returns numeric
language sql
stable
set search_path = ''
as $fn$
  select coalesce(sum(s.current_stock * coalesce(pr.cost_price, 0)), 0)
  from public.branch_product_stock s
  join public.products pr on pr.id = s.product_id
  where s.branch_id = any (p_branch_ids);
$fn$;

revoke all on function public.metrics_do_cliente(uuid, uuid) from public, anon, authenticated;
grant execute on function public.metrics_do_cliente(uuid, uuid) to service_role;
revoke all on function public.metrics_valor_em_estoque(uuid[]) from public, anon, authenticated;
grant execute on function public.metrics_valor_em_estoque(uuid[]) to service_role;

notify pgrst, 'reload schema';
