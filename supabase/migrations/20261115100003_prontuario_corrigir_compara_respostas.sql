-- Bloco Prontuário, PR2b — ajuste da correção (2026-11-14).
--
-- O "Salvar" do registro concluído destravado grava a evolução e a ficha do
-- procedimento juntas. A ficha que volta igual tinha o retrato das perguntas
-- (rows) remontado pelo servidor e contava como mudança: uma evolução
-- corrigida gerava DUAS versões. Agora a ficha só muda quando muda a resposta.
-- Mesmo corpo de 20261115100001, com essa comparação.

create or replace function public.prontuario_corrigir_registro(
  p_tenant uuid, p_agendamento uuid, p_campos jsonb, p_autor uuid, p_autor_nome text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cliente      uuid;
  v_profissional uuid;
  v_status       text;
  v_prontuario   uuid;
  v_entrada      public.medical_record_entries%rowtype;
  v_notas        text;
  v_interc       text;
  v_form         jsonb;
begin
  select a.client_id, a.professional_id, a.status::text into v_cliente, v_profissional, v_status
    from public.appointments a join public.branches b on b.id = a.branch_id
   where a.id = p_agendamento and b.tenant_id = p_tenant;
  if v_cliente is null then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_status <> 'COMPLETED' then
    raise exception 'Só se corrige o registro do atendimento concluído.' using errcode = 'check_violation';
  end if;

  select mr.id into v_prontuario from public.medical_records mr where mr.client_id = v_cliente;
  if v_prontuario is null then
    insert into public.medical_records (client_id) values (v_cliente) returning id into v_prontuario;
  end if;

  select * into v_entrada from public.medical_record_entries e where e.appointment_id = p_agendamento for update;
  if not found then
    -- Nada escrito antes: não há versão a guardar.
    insert into public.medical_record_entries (medical_record_id, appointment_id, professional_id, notes, intercurrences, form_data)
    values (v_prontuario, p_agendamento, v_profissional,
            nullif(p_campos ->> 'notes', ''), nullif(p_campos ->> 'intercurrences', ''),
            case when p_campos ? 'ficha' then jsonb_build_object('ficha', p_campos -> 'ficha') end);
    return jsonb_build_object('versao', false);
  end if;

  v_notas  := case when p_campos ? 'notes' then nullif(p_campos ->> 'notes', '') else v_entrada.notes end;
  v_interc := case when p_campos ? 'intercurrences' then nullif(p_campos ->> 'intercurrences', '') else v_entrada.intercurrences end;
  -- A ficha muda quando muda a RESPOSTA: o retrato das perguntas (rows)
  -- remontado pelo servidor não conta como correção.
  v_form   := case when p_campos ? 'ficha'
                   and (p_campos -> 'ficha' -> 'answers') is distinct from (v_entrada.form_data -> 'ficha' -> 'answers')
                then coalesce(v_entrada.form_data, '{}'::jsonb) || jsonb_build_object('ficha', p_campos -> 'ficha')
                else v_entrada.form_data end;

  if v_notas is not distinct from v_entrada.notes
     and v_interc is not distinct from v_entrada.intercurrences
     and (v_form -> 'ficha') is not distinct from (v_entrada.form_data -> 'ficha') then
    return jsonb_build_object('versao', false);
  end if;

  insert into public.prontuario_versoes (tenant_id, client_id, appointment_id, evolucao, intercorrencias, ficha, editada_por, editada_por_nome)
  values (p_tenant, v_cliente, p_agendamento, v_entrada.notes, v_entrada.intercurrences, v_entrada.form_data -> 'ficha',
          p_autor, coalesce(nullif(p_autor_nome, ''), 'Alguém da equipe'));

  update public.medical_record_entries
     set notes = v_notas, intercurrences = v_interc, form_data = v_form
   where id = v_entrada.id;

  return jsonb_build_object('versao', true);
end $$;

revoke execute on function public.prontuario_corrigir_registro(uuid, uuid, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.prontuario_corrigir_registro(uuid, uuid, jsonb, uuid, text) to service_role;

notify pgrst, 'reload schema';
