-- O ranking por procedimento (princípio 4, "Não chutar número"): o
-- procedimento sem nota PRÓPRIA não herda a nota do atendimento
-- (`appointments.client_rating`, que é da profissional). Vale a nota do
-- procedimento (`avaliacoes_dos_procedimentos`) e, no atendimento de antes
-- dela, a `procedure_rating` do procedimento principal; o resto fica sem nota
-- (fora da média), e a tela diz isso (`TEXTO_DA_NOTA_DO_PROCEDIMENTO`).
-- Corpo de partida: o de 20261104001802, sem o `client_rating`.

create or replace function public.metrics_notas_dos_procedimentos(p_appointment uuid)
 returns table(procedure_id uuid, nota numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select r.procedure_id, r.nota::numeric
    from public.avaliacoes_dos_procedimentos r
   where r.appointment_id = p_appointment
  union all
  select a.procedure_id, a.procedure_rating::numeric
    from public.appointments a
   where a.id = p_appointment
     and a.procedure_rating is not null
     and not exists (select 1 from public.avaliacoes_dos_procedimentos r where r.appointment_id = p_appointment)
$function$;

revoke execute on function public.metrics_notas_dos_procedimentos(uuid) from public, anon, authenticated;
grant execute on function public.metrics_notas_dos_procedimentos(uuid) to service_role;

notify pgrst, 'reload schema';
