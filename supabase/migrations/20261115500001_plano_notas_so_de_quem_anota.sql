-- Bloco Plano de tratamento, leva 1 — PT2 (a revisão do Heitor, 2026-11-13):
-- "quem monta o plano é quem atende, nem precisa de permissão pra isso".
--
-- Quem atende monta o plano, mas a ANOTAÇÃO clínica dele (as "Observações da
-- profissional", treatment_plans.professional_notes) continua do Prontuário.
-- A action não manda `notas_do_plano` quando quem gera o plano não anota — e
-- aqui, sem a chave, a anotação que já havia FICA (antes ela era zerada sempre
-- que o plano da avaliação era gerado de novo).
--
-- O corpo é o de produção (pg_get_functiondef), mudando só a linha do UPDATE.
-- Os grants ficam como estavam: só o servidor (service_role) executa.

create or replace function public.gerar_plano_da_avaliacao(p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_status       text;
  v_unidade      uuid;
  v_cliente      uuid;
  v_prof         uuid;
  v_rede         uuid;
  v_registro     boolean;
  v_plano        uuid;
  v_plano_status text;
  v_prontuario   uuid;
  v_sessao       jsonb;
  v_sessao_id    uuid;
  v_ordem        int := 0;
  v_sessoes      jsonb := coalesce(p_dados -> 'sessoes', '[]'::jsonb);
  v_anamnese     jsonb := case when jsonb_typeof(p_dados -> 'anamnese') = 'object' then p_dados -> 'anamnese' end;
  v_pendente     jsonb := case when jsonb_typeof(p_dados -> 'pendente') = 'object' then p_dados -> 'pendente' end;
  v_falta        text;
  v_ficha        jsonb := case when jsonb_typeof(p_dados -> 'ficha') = 'object' then p_dados -> 'ficha' end;
begin
  select a.status::text, a.branch_id, a.client_id, a.professional_id, b.tenant_id
    into v_status, v_unidade, v_cliente, v_prof, v_rede
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'Agendamento cancelado não gera plano.' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(v_sessoes) <> 'array' or jsonb_array_length(v_sessoes) = 0 then
    raise exception 'Adicione ao menos uma sessão ao plano antes de enviar.' using errcode = 'invalid_parameter_value';
  end if;
  -- Todo procedimento do plano é DESTA rede (o id vem do navegador).
  if exists (
    select 1
      from jsonb_array_elements(v_sessoes) s,
           jsonb_array_elements(coalesce(s -> 'procedimentos', '[]'::jsonb)) pr
     where not exists (
       select 1 from public.procedures p
        where p.id::text = pr ->> 'procedure_id' and p.tenant_id = p_tenant
     )
  ) then
    raise exception 'Procedimento do plano não encontrado.' using errcode = 'no_data_found';
  end if;

  -- O registro do atendimento concluído está travado: só o plano nasce.
  v_registro := v_status <> 'COMPLETED';

  -- A obrigatória em branco barra o plano (atend-04). Na avaliação concluída
  -- (registro travado) vale o que ficou gravado.
  v_falta := private.obrigatoria_que_falta(p_agendamento, p_tenant,
    case when v_registro then v_anamnese end, case when v_registro then v_ficha end,
    coalesce((p_dados ->> 'sem_injetaveis')::boolean, false));
  if v_falta is not null then
    raise exception '%', v_falta using errcode = 'check_violation';
  end if;

  select id, status into v_plano, v_plano_status
    from public.treatment_plans
   where evaluation_appointment_id = p_agendamento
     for update;
  if v_plano_status in ('ACCEPTED', 'COMPLETED') then
    raise exception 'O plano desta avaliação já foi fechado.' using errcode = 'invalid_parameter_value';
  end if;

  if v_plano is null then
    insert into public.treatment_plans
      (evaluation_appointment_id, client_id, branch_id, professional_id, professional_notes, status, updated_at)
    values
      (p_agendamento, v_cliente, v_unidade, (p_dados ->> 'profissional')::uuid,
       nullif(btrim(coalesce(p_dados ->> 'notas_do_plano', '')), ''), 'PROPOSED', now())
    returning id into v_plano;
  else
    update public.treatment_plans
       set client_id          = v_cliente,
           branch_id          = v_unidade,
           professional_id    = (p_dados ->> 'profissional')::uuid,
           -- PT2: sem a chave (quem gera não anota), a anotação que havia fica.
           professional_notes = case when p_dados ? 'notas_do_plano'
                                     then nullif(btrim(coalesce(p_dados ->> 'notas_do_plano', '')), '')
                                     else professional_notes end,
           status             = 'PROPOSED',
           updated_at         = now()
     where id = v_plano;
  end if;

  -- As sessões do editor substituem as que havia (cascade leva os procedimentos).
  delete from public.treatment_plan_sessions where plan_id = v_plano;
  for v_sessao in select * from jsonb_array_elements(v_sessoes)
  loop
    insert into public.treatment_plan_sessions (plan_id, sort_order)
    values (v_plano, v_ordem)
    returning id into v_sessao_id;

    insert into public.treatment_plan_session_procedures (session_id, procedure_id, price, sort_order, products)
    select v_sessao_id,
           (pr ->> 'procedure_id')::uuid,
           coalesce((pr ->> 'price')::numeric, 0),
           coalesce((pr ->> 'sort_order')::int, (o - 1)::int),
           case when jsonb_typeof(pr -> 'products') = 'array' then pr -> 'products' else '[]'::jsonb end
      from jsonb_array_elements(coalesce(v_sessao -> 'procedimentos', '[]'::jsonb)) with ordinality as t(pr, o);

    v_ordem := v_ordem + 1;
  end loop;

  if v_registro then
    select id into v_prontuario from public.medical_records where client_id = v_cliente;
    if v_prontuario is null then
      insert into public.medical_records (client_id) values (v_cliente) returning id into v_prontuario;
    end if;

    insert into public.medical_record_entries
      (medical_record_id, appointment_id, professional_id, queixas, notes, intercurrences, form_data)
    values
      (v_prontuario, p_agendamento, v_prof, p_dados ->> 'queixas', p_dados ->> 'notas', p_dados ->> 'intercorrencias',
       case when v_ficha is not null then jsonb_build_object('ficha', v_ficha) end)
    on conflict (appointment_id) do update
      set medical_record_id = excluded.medical_record_id,
          professional_id   = excluded.professional_id,
          queixas           = case when p_dados ? 'queixas' then excluded.queixas else medical_record_entries.queixas end,
          notes             = case when p_dados ? 'notas' then excluded.notes else medical_record_entries.notes end,
          intercurrences    = case when p_dados ? 'notas' then excluded.intercurrences else medical_record_entries.intercurrences end,
          form_data         = case when v_ficha is not null
                                   then coalesce(medical_record_entries.form_data, '{}'::jsonb) || jsonb_build_object('ficha', v_ficha)
                                   else medical_record_entries.form_data end;

    if v_anamnese is not null and coalesce(v_anamnese -> 'respostas', '{}'::jsonb) <> '{}'::jsonb then
      update public.medical_records set general_anamnesis = v_anamnese where id = v_prontuario;
    end if;
    -- A equipe revisou a ficha de saúde (mudando ou não): o pendente da cliente fecha.
    if v_pendente is not null and v_pendente <> '{}'::jsonb then
      update public.pre_atendimentos
         set status = 'RESPONDIDO', respostas = v_pendente, respondido_em = now(),
             origem = 'EQUIPE', respondido_por = p_ator, updated_at = now()
       where client_id = v_cliente and tenant_id = p_tenant and status = 'PENDENTE';
    end if;
  end if;

  insert into public.appointment_history
    (appointment_id, changed_by_id, changed_by_name, action, description)
  values (
    p_agendamento, p_ator, coalesce(p_ator_nome, 'Profissional'), 'PLAN_PROPOSED',
    case when v_registro
         then format('Plano de tratamento enviado para recepção — %s sessão(ões)', v_ordem)
         else format('Plano de tratamento gerado da avaliação concluída e enviado para recepção — %s sessão(ões)', v_ordem) end
  );

  return v_plano;
end
$function$;

revoke all on function public.gerar_plano_da_avaliacao(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.gerar_plano_da_avaliacao(uuid, uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
