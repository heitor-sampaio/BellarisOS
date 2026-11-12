-- F65 — as guardas de situação da agenda no banco (C11 e C13 do levantamento
-- das regras, 2026-11-11).
--
-- C11: o "Iniciar" pelo status reabria o atendimento CONCLUÍDO (o update não
-- tinha guarda), e o banco deixava: o gatilho `trg_atendimento_concluido_nao_cancela`
-- só recusava a volta a Cancelado e a Falta. Concluído tem prontuário, baixa
-- de estoque e comissão gravados: não muda mais de situação nenhuma. Desfazer
-- o dinheiro é estornar o pagamento. Nenhuma função do banco tira um
-- agendamento do Concluído (conferido em 2026-11-12: os cancelamentos de
-- pacote e de plano só mexem no Agendado/Confirmado).
--
-- C13 (H5 = a, o Heitor, 2026-11-11): só se conclui o que foi iniciado. A
-- `concluir_atendimento` aceitava o Agendado, o Confirmado e o Chegou — pelo
-- id, a conclusão pulava o termo do início, a pergunta do horário adiantado e
-- a trava dos termos que bloqueiam. A recusa mora na função (não no gatilho):
-- o gatilho valeria também para o ajuste à mão do banco de teste, e a regra é
-- da conclusão.

create or replace function private.atendimento_concluido_nao_cancela()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if old.status = 'COMPLETED' and new.status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'Atendimento concluído não pode ser cancelado nem marcado como falta. Para devolver o dinheiro, estorne o pagamento.'
      using errcode = 'P0001';
  end if;
  if old.status = 'COMPLETED' and new.status is distinct from 'COMPLETED' then
    raise exception 'Atendimento concluído não muda de situação. Para devolver o dinheiro, estorne o pagamento.'
      using errcode = 'P0001';
  end if;
  return new;
end $function$;

do $migracao$
declare
  v_def  text;
  v_novo text;
  v_ancora constant text := $a$if v_status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'Agendamento já finalizado.' using errcode = 'invalid_parameter_value';
  end if;$a$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'concluir_atendimento';
  if v_def is null then
    raise exception 'concluir_atendimento não encontrada';
  end if;
  if position(v_ancora in v_def) = 0 then
    raise exception 'concluir_atendimento: a âncora da recusa não foi encontrada';
  end if;
  if position('Só se conclui o atendimento que foi iniciado' in v_def) > 0 then
    return; -- já aplicada
  end if;
  v_novo := replace(v_def, v_ancora, v_ancora || $n$
  -- Só se conclui o que foi iniciado (H5 = a, F65).
  if v_status <> 'IN_PROGRESS' then
    raise exception 'Só se conclui o atendimento que foi iniciado: use “Iniciar” e depois “Finalizar”.' using errcode = 'invalid_parameter_value';
  end if;$n$);
  execute v_novo;
end
$migracao$;

notify pgrst, 'reload schema';
