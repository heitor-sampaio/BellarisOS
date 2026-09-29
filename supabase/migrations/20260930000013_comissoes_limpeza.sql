-- Comissões, limpeza depois do deploy das fases 1 e 2 (2026-09-30).
--
-- - `commission_rules.branch_id` só existia porque o `finishSession` de antes
--   filtrava por ela: a regra é do profissional na rede.
-- - `concluir_atendimento` deixa de aceitar o `comissao` singular do código de
--   antes do deploy: agora são as linhas (`comissoes`), montadas no servidor.
--
-- `loyalty_configs.commission_base` sai depois do PRÓXIMO deploy: o código que
-- está no ar ainda a seleciona na leitura da fidelidade.

alter table public.commission_rules drop column if exists branch_id;

create or replace function public.concluir_atendimento(p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = 'public'
as $function$
declare
  v_status     text;
  v_unidade    uuid;
  v_cliente    uuid;
  v_prof       uuid;
  v_rede       uuid;
  v_proc       uuid;
  v_preco_ag   numeric;
  v_plano      uuid;
  v_prontuario uuid;
  v_insumo     jsonb;
  v_sessao     uuid;
  v_pacote     uuid;
  v_linhas     jsonb := p_dados -> 'comissoes';
  v_linha      jsonb;
  v_cfg        public.commission_configs%rowtype;
  v_custo      numeric;
  v_soma_preco numeric;
  v_id         uuid;
  v_ids        uuid[] := '{}';
  v_item       int := 0;
begin
  select a.status::text, a.branch_id, a.client_id, a.professional_id, b.tenant_id, a.procedure_id, a.price, a.treatment_plan_id
    into v_status, v_unidade, v_cliente, v_prof, v_rede, v_proc, v_preco_ag, v_plano
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'Atendimento já concluído.' using errcode = 'invalid_parameter_value';
  end if;
  if v_status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'Agendamento já finalizado.' using errcode = 'invalid_parameter_value';
  end if;

  update public.appointments
  set status = 'COMPLETED', completed_at = now()
  where id = p_agendamento;

  select id into v_prontuario from public.medical_records where client_id = v_cliente;
  if v_prontuario is null then
    insert into public.medical_records (client_id) values (v_cliente) returning id into v_prontuario;
  end if;

  insert into public.medical_record_entries
    (medical_record_id, appointment_id, professional_id, notes, intercurrences)
  values
    (v_prontuario, p_agendamento, v_prof, p_dados ->> 'notas', p_dados ->> 'intercorrencias')
  on conflict (appointment_id) do update
    set medical_record_id = excluded.medical_record_id,
        professional_id   = excluded.professional_id,
        notes             = excluded.notes,
        intercurrences    = excluded.intercurrences;

  for v_insumo in select * from jsonb_array_elements(coalesce(p_dados -> 'insumos', '[]'::jsonb))
  loop
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
      (v_insumo ->> 'custo')::numeric
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
  end loop;

  select id, client_package_id into v_sessao, v_pacote
  from public.package_sessions
  where appointment_id = p_agendamento
  for update;
  if v_sessao is not null then
    update public.package_sessions set status = 'USED', used_at = now() where id = v_sessao;
    update public.client_packages set used_sessions = used_sessions + 1 where id = v_pacote;
  end if;


  if v_linhas is not null and jsonb_typeof(v_linhas) = 'array' and jsonb_array_length(v_linhas) > 0 then
    select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
    if not found then
      v_cfg.modo := 'ATENDIMENTO'; v_cfg.desconta_insumos := false; v_cfg.desconta_taxa := false;
      v_cfg.base_com_pontos := 'PRECO';
    end if;
    -- O custo dos insumos: a mesma conta de metrics_giro_estoque, sobre os
    -- movimentos que esta transação acabou de gravar.
    select coalesce(sum(abs(m.quantity) * coalesce(m.unit_cost, p.cost_price, 0)), 0) into v_custo
      from public.stock_movements m
      left join public.products p on p.id = m.product_id
     where m.appointment_id = p_agendamento and m.type = 'PROCEDURE_USAGE';
    select coalesce(sum((l ->> 'preco')::numeric), 0) into v_soma_preco from jsonb_array_elements(v_linhas) l;

    for v_linha in select * from jsonb_array_elements(v_linhas)
    loop
      insert into public.commission_lines
        (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
         regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos)
      values (
        p_tenant, v_unidade, p_agendamento, v_item,
        nullif(v_linha ->> 'procedure_id', '')::uuid, v_prof,
        v_linha ->> 'origem', nullif(v_linha ->> 'treatment_plan_id', '')::uuid,
        (v_linha ->> 'regra_tipo')::public."CommissionType", (v_linha ->> 'regra_valor')::numeric,
        v_cfg.modo, v_cfg.desconta_insumos, v_cfg.desconta_taxa, v_cfg.base_com_pontos,
        round((v_linha ->> 'preco')::numeric, 2),
        case when v_soma_preco > 0 then round(v_custo * (v_linha ->> 'preco')::numeric / v_soma_preco, 2)
             else round(v_custo / jsonb_array_length(v_linhas), 2) end
      )
      on conflict (appointment_id, item) do nothing
      returning id into v_id;
      if v_id is not null then
        v_ids := v_ids || v_id;
        perform private.comissao_acertar_linha(v_id, 'Atendimento concluído', null);
      end if;
      v_item := v_item + 1;
      v_id := null;
    end loop;
  end if;

  if p_ator is not null then
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'COMPLETED', 'Atendimento concluído pelo profissional');
  end if;

  return jsonb_build_object(
    'comissao_criada', coalesce(array_length(v_ids, 1), 0) > 0,
    'pacote', v_pacote,
    'comissoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'linha', cl.id, 'procedure_id', cl.procedure_id,
               'liberado', (select coalesce(sum(c.amount), 0) from public.commissions c where c.line_id = cl.id)
             ) order by cl.item), '[]'::jsonb)
        from public.commission_lines cl where cl.id = any (v_ids)
    )
  );
end
$function$;

revoke execute on function public.concluir_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.concluir_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
