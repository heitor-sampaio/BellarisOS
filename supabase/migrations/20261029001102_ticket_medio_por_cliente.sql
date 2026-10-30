-- Ticket médio = a média de quanto cada CLIENTE gasta na clínica (decisão do
-- Heitor, 2026-10-29). A conta: o que as clientes pagaram no período ÷ as
-- clientes que pagaram (quem não pagou não entra). Pelo eixo da receita paga
-- (metrics_receitas_pagas: INCOME pago, sem estorno dos dois lados, eixo em
-- paid_at), entra tudo que tem cliente: atendimento, pacote, plano (entrada e
-- parcelas), pré-pago e, quando existir, produto. É UM indicador só com o
-- antigo "Gasto médio" de Relatórios → Clientes (que era avg do pago de quem
-- pagou: o mesmo número), agora com o nome "Ticket médio" em toda tela.
-- Era receita de serviço ÷ atendimentos cobrados (2026-10-27).
--
-- Uma linha por unidade e a do total (branch_id nulo): a cliente que pagou em
-- duas unidades conta uma vez no total e uma vez em cada unidade.
-- Com `p_professional_id` ("só os meus" do financeiro), o dinheiro DELA — o
-- predicado de metrics_receitas_pagas (a transação ligada a um atendimento dela).

create or replace function public.metrics_ticket_medio(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null)
 returns table(branch_id uuid, pago numeric, clientes bigint)
 language sql
 stable
 set search_path to ''
as $function$
  select t.branch_id, coalesce(sum(t.amount), 0), count(distinct t.client_id)
    from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t
   where t.client_id is not null
   group by grouping sets ((t.branch_id), ())
$function$;

revoke all on function public.metrics_ticket_medio(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_ticket_medio(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
