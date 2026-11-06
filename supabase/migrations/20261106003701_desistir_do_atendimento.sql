-- A27 da 8ª simulação (2026-11-06): a desistência no MEIO do atendimento só
-- pedia o motivo. A cliente passou mal depois da aplicação, e a profissional não
-- tinha como registrar a intercorrência no prontuário nem baixar o insumo que já
-- tinha usado.
--
-- UMA transação, como a conclusão (§10): o agendamento travado e EM ATENDIMENTO,
-- o cancelamento (status, motivo, histórico), a intercorrência no prontuário do
-- atendimento (quando veio) e a baixa de cada insumo (quando veio) — a conta da
-- baixa é do app (lib/estoque/baixa.ts), como na conclusão, e o banco confere o
-- saldo lido (`estoque_conferir_lido`, PT409). Nada de comissão, de sessão de
-- pacote usada nem de pré-pago: não houve atendimento concluído — o gatilho
-- `pre_pago_libera` devolve à cliente o que estava pago, como em todo
-- cancelamento.

create or replace function public.desistir_do_atendimento(
  p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status     text;
  v_unidade    uuid;
  v_cliente    uuid;
  v_prof       uuid;
  v_rede       uuid;
  v_prontuario uuid;
  v_insumo     jsonb;
  v_motivo     text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_interc     text := nullif(btrim(coalesce(p_dados ->> 'intercorrencias', '')), '');
  v_baixados   int := 0;
begin
  if v_motivo is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'invalid_parameter_value';
  end if;

  select a.status::text, a.branch_id, a.client_id, a.professional_id, b.tenant_id
    into v_status, v_unidade, v_cliente, v_prof, v_rede
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'IN_PROGRESS' then
    raise exception 'Só o atendimento em andamento registra a desistência com intercorrência e insumos.' using errcode = 'invalid_parameter_value';
  end if;

  update public.appointments
     set status = 'CANCELLED', cancelled_at = now(), cancellation_reason = v_motivo
   where id = p_agendamento;

  if v_interc is not null then
    select id into v_prontuario from public.medical_records where client_id = v_cliente;
    if v_prontuario is null then
      insert into public.medical_records (client_id) values (v_cliente) returning id into v_prontuario;
    end if;
    insert into public.medical_record_entries (medical_record_id, appointment_id, professional_id, intercurrences)
    values (v_prontuario, p_agendamento, v_prof, v_interc)
    on conflict (appointment_id) do update
      set intercurrences = excluded.intercurrences;
  end if;

  for v_insumo in select * from jsonb_array_elements(coalesce(p_dados -> 'insumos', '[]'::jsonb))
  loop
    perform private.estoque_conferir_lido((v_insumo ->> 'produto')::uuid, v_unidade, v_insumo);
    insert into public.stock_movements
      (branch_id, product_id, type, quantity, balance_after, appointment_id, created_by, unit_cost)
    values (
      v_unidade,
      (v_insumo ->> 'produto')::uuid,
      'PROCEDURE_USAGE',
      (v_insumo ->> 'quantidade')::numeric,
      (v_insumo ->> 'saldo_apos')::numeric,
      p_agendamento,
      coalesce(p_ator::text, 'sistema'),
      (select public.custo_de_consumo(p) from public.products p where p.id = (v_insumo ->> 'produto')::uuid)
    );
    insert into public.branch_product_stock
      (product_id, branch_id, current_stock, current_rendimento, min_stock, updated_at)
    values (
      (v_insumo ->> 'produto')::uuid, v_unidade,
      (v_insumo ->> 'embalagens')::numeric,
      (v_insumo ->> 'rendimento')::numeric,
      coalesce((v_insumo ->> 'minimo')::numeric, 0),
      now()
    )
    on conflict (product_id, branch_id) do update
      set current_stock      = excluded.current_stock,
          current_rendimento = excluded.current_rendimento,
          updated_at         = excluded.updated_at;
    v_baixados := v_baixados + 1;
  end loop;

  insert into public.appointment_history
    (appointment_id, changed_by_id, changed_by_name, action, description, metadata)
  values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'CANCELLED', 'Cancelado: ' || v_motivo,
          jsonb_build_object('desistencia', true, 'intercorrencia', v_interc is not null, 'insumos', v_baixados));

  return jsonb_build_object('intercorrencia', v_interc is not null, 'insumos', v_baixados);
end
$function$;

revoke execute on function public.desistir_do_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.desistir_do_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
