-- A desistência NO MEIO do atendimento não devolve a sessão paga (o Heitor,
-- 2026-11-18: "Não existe isso de desistir no meio do atendimento. Se isso por
-- ventura acontecer, problema de quem desistir."). Até aqui o
-- `pre_pago_libera` soltava a sessão do pacote, a do plano e a unidade do
-- pré-pago em TODO cancelamento, e a cliente ganhava a sessão de volta.
--
-- Agora, cancelar o que foi INICIADO (de IN_PROGRESS para CANCELLED — a
-- desistência, pelo `desistir_do_atendimento` ou pelo cancelamento direto):
--   * a sessão do pacote fica USADA (e conta no `used_sessions`), como na
--     conclusão;
--   * a unidade do pré-pago fica USADA;
--   * a sessão do plano fica ligada ao agendamento (não volta a "a agendar") e
--     conta como feita no `metrics_financeiro_do_plano`.
-- O insumo já se baixava (`desistir_do_atendimento`); a comissão e a cobrança
-- seguem de fora (não houve conclusão). O cancelamento ANTES de iniciar e a
-- falta devolvem a sessão, como sempre.

create or replace function private.pre_pago_libera()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_pacote uuid;
begin
  if new.status::text = 'CANCELLED' and old.status::text = 'IN_PROGRESS' then
    for v_pacote in
      update public.package_sessions
         set status = 'USED', used_at = now()
       where appointment_id = new.id and status = 'AVAILABLE'
      returning client_package_id
    loop
      update public.client_packages set used_sessions = used_sessions + 1 where id = v_pacote;
    end loop;
    update public.procedure_sale_units
       set status = 'USADA', used_at = now()
     where appointment_id = new.id and status = 'DISPONIVEL';
    return new;
  end if;

  if new.status::text in ('CANCELLED', 'NO_SHOW') and old.status::text is distinct from new.status::text then
    update public.procedure_sale_units
       set appointment_id = null
     where appointment_id = new.id and status = 'DISPONIVEL';
    update public.package_sessions
       set appointment_id = null
     where appointment_id = new.id and status = 'AVAILABLE';
    update public.treatment_plan_sessions
       set appointment_id = null
     where appointment_id = new.id;
  end if;
  return new;
end $function$;

revoke execute on function private.pre_pago_libera() from public, anon, authenticated;

-- A sessão do plano cancelada DEPOIS de iniciada conta como feita (a de
-- antes de iniciar já se solta do agendamento). Corpo de partida: o de
-- 20261029001801, só com a contagem das feitas.
create or replace function public.metrics_financeiro_do_plano(p_tenant uuid, p_plan uuid)
 returns table(valor numeric, recebido numeric, a_receber numeric, sessoes_total integer, sessoes_feitas integer, sessoes_agendadas integer)
 language sql
 stable
 set search_path to ''
as $function$
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
      where s.plan_id in (select id from plano)
        and (a.status = 'COMPLETED' or (a.status = 'CANCELLED' and a.started_at is not null))),
    (select count(*)::int
       from public.treatment_plan_sessions s
       join public.appointments a on a.id = s.appointment_id
      where s.plan_id in (select id from plano) and a.status in ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'))
$function$;

revoke execute on function public.metrics_financeiro_do_plano(uuid, uuid) from public, anon, authenticated;
grant execute on function public.metrics_financeiro_do_plano(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
