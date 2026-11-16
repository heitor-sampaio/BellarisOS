-- Os procedimentos feitos no atendimento saem NA ORDEM DA SESSÃO.
--
-- A função não tinha `order by`, e um `union all` com junção não garante ordem
-- nenhuma: a cliente podia ver "Preenchimento, Botox" numa sessão montada
-- "Botox, Preenchimento" — e as notas, gravadas na ordem em que ela as viu
-- (F17-3, `avaliacoes_dos_procedimentos.ordem`), herdavam a troca. Pego pela 1ª
-- completa contra o banco de testes local (2026-11-16).
--
-- O corpo é o ATUAL da produção (com o plano cancelado contando, F-cancelado),
-- só com a ordem: `sort_order` da sessão e o id de desempate; o procedimento
-- do agendamento avulso é uma linha só.

create or replace function public.metrics_procedimentos_executados(p_appointment uuid, p_procedure uuid)
returns table (procedure_id uuid)
language sql
stable
set search_path to ''
as $$
  select x.procedure_id
    from (
      select sp.procedure_id, sp.sort_order as ordem, sp.id as desempate
        from public.treatment_plan_sessions s
        join public.treatment_plans tp on tp.id = s.plan_id and (tp.status in ('ACCEPTED', 'COMPLETED') or tp.cancelado_em is not null)
        join public.treatment_plan_session_procedures sp on sp.session_id = s.id
       where s.appointment_id = p_appointment and sp.procedure_id is not null
      union all
      select p_procedure, 0, null::uuid
       where p_procedure is not null
         and not exists (
           select 1
             from public.treatment_plan_sessions s
             join public.treatment_plans tp on tp.id = s.plan_id and (tp.status in ('ACCEPTED', 'COMPLETED') or tp.cancelado_em is not null)
             join public.treatment_plan_session_procedures sp on sp.session_id = s.id
            where s.appointment_id = p_appointment and sp.procedure_id is not null)
    ) x
   order by x.ordem, x.desempate
$$;

revoke execute on function public.metrics_procedimentos_executados(uuid, uuid) from public, anon, authenticated;
grant execute on function public.metrics_procedimentos_executados(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
