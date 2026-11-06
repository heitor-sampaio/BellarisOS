-- D13 da 8ª simulação (2026-11-06): o termo configurado para "nasce no início
-- do atendimento" (INICIO_ATENDIMENTO) nascia no "Confirmar agendamento".
-- Era um resto do tempo em que o check-in gravava CONFIRMED; desde 2026-10-21
-- (migrations 20261021000009/10) confirmar é "confirmou presença" e o check-in
-- é ARRIVED — e docs/regras/documentos.md diz "check-in, os de
-- INICIO_ATENDIMENTO".
--
-- Agora os do início nascem na CHEGADA (ARRIVED) — e, sem a chegada, ao
-- iniciar: `private.documentos_bloqueiam_inicio` já os emite antes de
-- conferir a trava (o atendimento começa de Confirmado ou de Chegou). Os que
-- já nasceram num CONFIRMED ficam como estão: a emissão é idempotente (o
-- conflito por agendamento × modelo não faz nada), então a chegada e o início
-- não os duplicam. Nada apagado.
--
-- Partiu do corpo ATUAL da produção (pg_get_functiondef em 2026-11-06).

create or replace function private.documentos_no_agendamento()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.treatment_plan_id is not null then return null; end if;

  if tg_op = 'INSERT' then
    perform public.documentos_emitir_do_atendimento(new.id,
      case when new.status::text in ('ARRIVED', 'IN_PROGRESS')
           then array['AGENDAMENTO', 'INICIO_ATENDIMENTO'] else array['AGENDAMENTO'] end);
    return null;
  end if;

  if new.status in ('CANCELLED', 'NO_SHOW') and old.status is distinct from new.status then
    perform private.documentos_cancelar_do_atendimento(new.id,
      case new.status when 'CANCELLED' then 'Agendamento cancelado' else 'Cliente não compareceu' end, null);
    return null;
  end if;

  if new.procedure_id is distinct from old.procedure_id then
    perform private.documentos_cancelar_do_atendimento(new.id, 'Procedimento trocado', new.procedure_id);
    perform public.documentos_emitir_do_atendimento(new.id,
      case when new.status::text in ('ARRIVED', 'IN_PROGRESS')
           then array['AGENDAMENTO', 'INICIO_ATENDIMENTO'] else array['AGENDAMENTO'] end);
  end if;

  -- O check-in (ARRIVED) emite os do início; o início direto de Confirmado
  -- também (a trava do início os emite antes de conferir, e aqui é idempotente).
  if new.status::text in ('ARRIVED', 'IN_PROGRESS') and old.status::text not in ('ARRIVED', 'IN_PROGRESS') then
    perform public.documentos_emitir_do_atendimento(new.id, array['AGENDAMENTO', 'INICIO_ATENDIMENTO']);
  end if;
  return null;
end $function$;

notify pgrst, 'reload schema';
