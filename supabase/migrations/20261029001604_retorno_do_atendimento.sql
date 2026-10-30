-- D-12 (decisão do Heitor, 2026-10-29): "Fazer o campo 'Retorno em N dias' no
-- atendimento. Ele vira lembrete à recepção e gatilho de automação."
--
-- 1. O atendimento guarda o retorno: os dias, o DIA (a conclusão + N, em
--    Brasília) e quando o cron já emitiu o "Retorno vencendo".
-- 2. concluir_atendimento grava o retorno NA MESMA transação da conclusão
--    (atendimento.md §10): `p_dados.retorno_dias`. O resto da função é o mesmo.
-- 3. retornos_a_marcar: os retornos da unidade que vencem até o dia pedido e
--    ainda não foram marcados (a cliente não tem agendamento depois da
--    conclusão, fora cancelado e falta) — a lista da recepção, com o total.

alter table public.appointments
  add column if not exists retorno_em_dias smallint
    check (retorno_em_dias is null or retorno_em_dias between 1 and 730),
  add column if not exists retorno_para date,
  add column if not exists retorno_avisado_em timestamptz;

comment on column public.appointments.retorno_em_dias is
  'Retorno em N dias, dito pela profissional ao finalizar (D-12). Gravado por concluir_atendimento.';
comment on column public.appointments.retorno_para is
  'O dia do retorno: a conclusão + retorno_em_dias, em America/Sao_Paulo.';
comment on column public.appointments.retorno_avisado_em is
  'Quando o cron emitiu agendamento.retorno_vencendo (uma vez por atendimento).';

create index if not exists appointments_retorno_para_idx
  on public.appointments (retorno_para)
  where retorno_para is not null;

create or replace function public.concluir_atendimento(p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb)
 returns jsonb
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
  v_sessao     uuid;
  v_pacote     uuid;
  v_unidade_pp uuid;
  v_venda_pp   uuid;
  v_linhas     jsonb := p_dados -> 'comissoes';
  v_linha      jsonb;
  v_cfg        public.commission_configs%rowtype;
  v_custo      numeric;
  v_soma_preco numeric;
  v_id         uuid;
  v_ids        uuid[] := '{}';
  v_item       int := 0;
  v_anamnese   jsonb := p_dados -> 'anamnese';
  v_ficha      jsonb := case when jsonb_typeof(p_dados -> 'ficha') = 'object' then p_dados -> 'ficha' end;
  -- D-12: o retorno em N dias (opcional). O app confere; o banco também.
  v_retorno    int := case when jsonb_typeof(p_dados -> 'retorno_dias') = 'number' then (p_dados ->> 'retorno_dias')::int end;
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
  if v_status = 'COMPLETED' then
    raise exception 'Atendimento já concluído.' using errcode = 'invalid_parameter_value';
  end if;
  if v_status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'Agendamento já finalizado.' using errcode = 'invalid_parameter_value';
  end if;
  if v_retorno is not null and (v_retorno < 1 or v_retorno > 730) then
    raise exception 'O retorno vai de 1 a 730 dias.' using errcode = 'invalid_parameter_value';
  end if;

  update public.appointments
  set status = 'COMPLETED', completed_at = now(),
      retorno_em_dias = v_retorno,
      retorno_para    = case when v_retorno is not null
                             then (now() at time zone 'America/Sao_Paulo')::date + v_retorno end
  where id = p_agendamento;

  select id into v_prontuario from public.medical_records where client_id = v_cliente;
  if v_prontuario is null then
    insert into public.medical_records (client_id) values (v_cliente) returning id into v_prontuario;
  end if;

  insert into public.medical_record_entries
    (medical_record_id, appointment_id, professional_id, notes, intercurrences, queixas, form_data)
  values
    (v_prontuario, p_agendamento, v_prof, p_dados ->> 'notas', p_dados ->> 'intercorrencias', p_dados ->> 'queixas',
     case when v_ficha is not null then jsonb_build_object('ficha', v_ficha) end)
  on conflict (appointment_id) do update
    set medical_record_id = excluded.medical_record_id,
        professional_id   = excluded.professional_id,
        notes             = excluded.notes,
        intercurrences    = excluded.intercurrences,
        queixas           = case when p_dados ? 'queixas' then excluded.queixas else medical_record_entries.queixas end,
        form_data         = case when v_ficha is not null
                                 then coalesce(medical_record_entries.form_data, '{}'::jsonb) || jsonb_build_object('ficha', v_ficha)
                                 else medical_record_entries.form_data end;

  if jsonb_typeof(v_anamnese) = 'object'
     and coalesce(v_anamnese -> 'respostas', '{}'::jsonb) <> '{}'::jsonb then
    update public.medical_records set general_anamnesis = v_anamnese where id = v_prontuario;
    update public.pre_atendimentos
       set status = 'RESPONDIDO', respostas = v_anamnese -> 'respostas', respondido_em = now(),
           origem = 'EQUIPE', respondido_por = p_ator, updated_at = now()
     where client_id = v_cliente and tenant_id = p_tenant and status = 'PENDENTE';
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
  end loop;

  select id, client_package_id into v_sessao, v_pacote
  from public.package_sessions
  where appointment_id = p_agendamento
  for update;
  if v_sessao is not null then
    update public.package_sessions set status = 'USED', used_at = now() where id = v_sessao;
    update public.client_packages set used_sessions = used_sessions + 1 where id = v_pacote;
  end if;

  select u.id, u.sale_id into v_unidade_pp, v_venda_pp
    from public.procedure_sale_units u
   where u.appointment_id = p_agendamento and u.status = 'DISPONIVEL'
     for update;
  if v_unidade_pp is not null then
    update public.procedure_sale_units set status = 'USADA', used_at = now() where id = v_unidade_pp;
  end if;

  if v_linhas is not null and jsonb_typeof(v_linhas) = 'array' and jsonb_array_length(v_linhas) > 0 then
    select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
    if not found then
      v_cfg.modo := 'ATENDIMENTO'; v_cfg.desconta_insumos := false; v_cfg.desconta_taxa := false;
      v_cfg.base_com_pontos := 'PRECO';
    end if;
    select coalesce(sum(public.custo_do_movimento(m, p)), 0) into v_custo
      from public.stock_movements m
      left join public.products p on p.id = m.product_id
     where m.appointment_id = p_agendamento and m.type = 'PROCEDURE_USAGE';
    select coalesce(sum((l ->> 'preco')::numeric), 0) into v_soma_preco from jsonb_array_elements(v_linhas) l;

    for v_linha in select * from jsonb_array_elements(v_linhas)
    loop
      insert into public.commission_lines
        (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
         client_package_id, procedure_sale_id, regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos,
         preco, custo_insumos)
      values (
        p_tenant, v_unidade, p_agendamento, v_item,
        nullif(v_linha ->> 'procedure_id', '')::uuid, v_prof,
        v_linha ->> 'origem', nullif(v_linha ->> 'treatment_plan_id', '')::uuid,
        case when v_linha ->> 'origem' = 'PACOTE' then v_pacote else null end,
        case when v_linha ->> 'origem' = 'PRE_PAGO' then v_venda_pp else null end,
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
    values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'COMPLETED',
            'Atendimento concluído pelo profissional'
            || case when v_retorno is not null then ' · retorno em ' || v_retorno || case when v_retorno = 1 then ' dia' else ' dias' end else '' end);
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

-- A lista da recepção: os retornos da unidade entre `p_de` e `p_ate` (o dia do
-- retorno) que ainda não foram marcados. "Marcado" = a cliente tem agendamento
-- DEPOIS da conclusão, em qualquer unidade da rede, fora cancelado e falta.
-- Com a agenda "só os meus", só os atendimentos dela. `total` é a contagem
-- inteira (a tela mostra os primeiros).
create or replace function public.retornos_a_marcar(
  p_tenant uuid, p_branch uuid, p_de date, p_ate date, p_professional_id uuid default null)
returns table (
  id uuid, client_id uuid, cliente text, procedimento text, profissional text,
  retorno_para date, retorno_em_dias smallint, total bigint)
language sql stable set search_path = '' as $$
  select a.id, a.client_id, c.name, p.name, u.name, a.retorno_para, a.retorno_em_dias,
         count(*) over ()
    from public.appointments a
    join public.branches b on b.id = a.branch_id and b.tenant_id = p_tenant
    left join public.clients c on c.id = a.client_id
    left join public.procedures p on p.id = a.procedure_id
    left join public.users u on u.id = a.professional_id
   where a.branch_id = p_branch
     and a.status = 'COMPLETED'
     and a.retorno_para between p_de and p_ate
     and (p_professional_id is null or a.professional_id = p_professional_id)
     and not exists (
       select 1 from public.appointments n
        join public.branches nb on nb.id = n.branch_id and nb.tenant_id = p_tenant
        where n.client_id = a.client_id and n.id <> a.id
          and n.scheduled_at > a.completed_at
          and n.status not in ('CANCELLED', 'NO_SHOW'))
   order by a.retorno_para, a.id
$$;

revoke execute on function public.retornos_a_marcar(uuid, uuid, date, date, uuid) from public, anon, authenticated;
grant execute on function public.retornos_a_marcar(uuid, uuid, date, date, uuid) to service_role;

notify pgrst, 'reload schema';
