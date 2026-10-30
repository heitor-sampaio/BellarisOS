-- J-42 (ajustes J, 2026-10-30): a tela do plano fechado mostra o valor, o
-- recebido, o a receber e as sessões feitas. Contados AQUI, não na tela
-- (indicadores.md, "Nenhuma tela soma dinheiro"):
--   valor     = a soma dos procedimentos das sessões (o preço vendido, com o
--               desconto já rateado — plano_aplicar_desconto);
--   recebido  = a regra única de receita (metrics_receitas_pagas) ligada ao
--               plano: INCOME pago, sem os dois lados do estorno;
--   a_receber = INCOME em aberto do plano, de qualquer vencimento, sem o
--               zerado (histórico de saldo substituído) e sem estorno;
--   sessões   = as do plano; feitas = atendimento CONCLUÍDO; agendadas =
--               atendimento ainda em aberto (agendado, confirmado, chegou, em
--               atendimento).
-- O plano tem de ser da rede (p_tenant): de outra, tudo zero.
create or replace function public.metrics_financeiro_do_plano(p_tenant uuid, p_plan uuid)
returns table(
  valor numeric, recebido numeric, a_receber numeric,
  sessoes_total int, sessoes_feitas int, sessoes_agendadas int
)
language sql
stable
set search_path to ''
as $$
  with plano as (
    select tp.id
      from public.treatment_plans tp
      join public.branches b on b.id = tp.branch_id
     where tp.id = p_plan and b.tenant_id = p_tenant
  )
  select
    coalesce((
      select round(sum(sp.price), 2)
        from public.treatment_plan_session_procedures sp
        join public.treatment_plan_sessions s on s.id = sp.session_id
       where s.plan_id in (select id from plano)
    ), 0),
    coalesce((
      select round(sum(t.amount), 2)
        from public.metrics_receitas_pagas(p_tenant, null, '2000-01-01'::timestamptz, 'infinity'::timestamptz) t
       where t.treatment_plan_id in (select id from plano)
    ), 0),
    coalesce((
      select round(sum(t.amount), 2)
        from public.financial_transactions t
       where t.treatment_plan_id in (select id from plano)
         and t.type = 'INCOME' and not t.is_paid and t.amount > 0
         and coalesce(t.notes, '')    <> 'Estornada'
         and coalesce(t.category, '') <> 'Estorno'
    ), 0),
    (select count(*)::int from public.treatment_plan_sessions s where s.plan_id in (select id from plano)),
    (select count(*)::int
       from public.treatment_plan_sessions s
       join public.appointments a on a.id = s.appointment_id
      where s.plan_id in (select id from plano) and a.status = 'COMPLETED'),
    (select count(*)::int
       from public.treatment_plan_sessions s
       join public.appointments a on a.id = s.appointment_id
      where s.plan_id in (select id from plano) and a.status in ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'))
$$;

-- Recebe a rede por parâmetro: só o servidor chama.
revoke execute on function public.metrics_financeiro_do_plano(uuid, uuid) from public, anon, authenticated;
grant execute on function public.metrics_financeiro_do_plano(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
