-- O plano da avaliação numa gravação só (revisão do Heitor, 2026-10-29).
--
-- O "Enviar para a recepção" salvava a ficha do procedimento numa action e
-- depois gerava o plano em outra — e o plano gravava a anamnese, o plano, as
-- sessões, as dores e a evolução em passos soltos. O plano que falhava (um
-- procedimento que sumiu, uma sessão que não gravou) deixava a ficha, a
-- anamnese e um plano PROPOSTO sem procedimento gravados pela metade.
--
-- O padrão do projeto: o app CALCULA (a anamnese no formato da ficha, o
-- retrato da ficha do procedimento com o planejador de injetáveis, as
-- obrigatórias) e esta função GRAVA tudo numa transação — como
-- `concluir_atendimento`. Nenhuma regra de negócio aqui além das travas.
--
-- A avaliação CONCLUÍDA (o registro travado, A30) também gera o plano — "é
-- preciso avaliar primeiro pra depois decidir o que fazer" —, mas sem regravar
-- o prontuário daquele dia: as dores, a evolução, a ficha e a anamnese ficam
-- como estão; só o plano nasce, ligado à avaliação.
--
-- p_dados:
--   profissional    uuid   quem monta o plano (treatment_plans.professional_id)
--   notas_do_plano  text   a anotação do plano
--   sessoes         [{ procedimentos: [{ procedure_id, price, sort_order, products }] }]
--   queixas         text   as dores (só no atendimento não concluído)
--   notas, intercorrencias  a evolução — só quando a chave `notas` vem
--   anamnese        jsonb  a anamnese a gravar (nula = a gravada fica)
--   pendente        jsonb  as respostas que fecham o pré-atendimento pendente
--   ficha           jsonb  { formId, name, rows, answers } → form_data.ficha

CREATE OR REPLACE FUNCTION public.gerar_plano_da_avaliacao(p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           professional_notes = nullif(btrim(coalesce(p_dados ->> 'notas_do_plano', '')), ''),
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

-- Recebe a rede por parâmetro: só o servidor (CLAUDE.md §4).
revoke execute on function public.gerar_plano_da_avaliacao(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.gerar_plano_da_avaliacao(uuid, uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
