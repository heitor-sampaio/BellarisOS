-- Pacotes: catálogo e venda (decisão do Heitor, 2026-09-30). Até aqui
-- `service_packages` e `client_packages` só existiam no banco de demonstração —
-- nenhuma tela os criava, e a sessão de pacote era "paga na venda" de uma venda
-- que o sistema não registrava.
--
-- - A venda é UMA transação (`pacote_vender`): o pacote do cliente (com o
--   RETRATO do preço), as sessões e o dinheiro. O app monta os lançamentos
--   (à vista, entrada + parcelas, a receber) e a função confere que fecham com
--   o preço — "o app calcula, uma função grava".
-- - O dinheiro do pacote leva `financial_transactions.client_package_id`, e a
--   comissão da sessão de pacote no modo "quando o cliente paga" passa a ser
--   liberada na proporção do que o pacote recebeu, como o plano.
-- - A sessão só LÊ pacote: as políticas de INSERT/UPDATE abertas a qualquer
--   funcionário saem (dava para dar sessão de graça a um cliente pela chave
--   pública).

alter table public.client_packages
  add column price   numeric check (price is null or price >= 0),
  add column sold_by uuid references public.users(id) on delete set null;

alter table public.financial_transactions
  add column client_package_id uuid references public.client_packages(id) on delete set null;
create index financial_transactions_pacote_idx on public.financial_transactions (client_package_id)
  where client_package_id is not null;

alter table public.commission_lines
  add column client_package_id uuid references public.client_packages(id) on delete set null;
create index idx_commission_lines_pacote on public.commission_lines (client_package_id)
  where client_package_id is not null;

drop policy if exists client_packages_insert on public.client_packages;
drop policy if exists service_packages_insert on public.service_packages;
drop policy if exists service_packages_update on public.service_packages;

-- ─── Vender ──────────────────────────────────────────────────────────────────
-- p_lancamentos: [{ amount, payment_method, is_paid, due_date, notes,
--                   parcelas: [{ number, total, amount, due_date }] }]
create or replace function public.pacote_vender(
  p_tenant uuid, p_cliente uuid, p_pacote uuid, p_unidade uuid, p_ator uuid, p_lancamentos jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_pac   public.service_packages%rowtype;
  v_nome  text;
  v_cp    uuid;
  v_soma  numeric;
  v_l     jsonb;
  v_tx    uuid;
  v_agora timestamptz := now();

begin
  select * into v_pac from public.service_packages sp where sp.id = p_pacote and sp.tenant_id = p_tenant;
  if not found then
    raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
  end if;
  if not v_pac.is_active then
    raise exception 'Este pacote está desativado.' using errcode = 'P0001';
  end if;
  if v_pac.branch_id is not null and v_pac.branch_id <> p_unidade then
    raise exception 'Este pacote é de outra unidade.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select c.name into v_nome from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;

  select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) into v_soma
    from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l;
  if v_soma <> round(v_pac.price, 2) then
    raise exception 'O pagamento não fecha com o preço do pacote.' using errcode = 'P0001';
  end if;

  insert into public.client_packages
    (client_id, package_id, branch_id, purchased_at, expires_at, total_sessions, used_sessions, price, sold_by)
  values (
    p_cliente, p_pacote, p_unidade, v_agora,
    case when v_pac.validity_days is null then null else v_agora + make_interval(days => v_pac.validity_days) end,
    v_pac.total_sessions, 0, v_pac.price, p_ator
  ) returning id into v_cp;

  insert into public.package_sessions (client_package_id, status, session_number)
  select v_cp, 'AVAILABLE', n from generate_series(1, v_pac.total_sessions) n;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, client_package_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by)
    values (
      p_unidade, p_cliente, v_cp, 'INCOME', 'Serviços', 'Pacote — ' || v_pac.name,
      round((v_l ->> 'amount')::numeric, 2),
      nullif(v_l ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l ->> 'is_paid')::boolean, false),
      case when coalesce((v_l ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l ->> 'due_date', '')::timestamptz,
      nullif(v_l ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema')
    ) returning id into v_tx;

    if jsonb_typeof(v_l -> 'parcelas') = 'array' then
      insert into public.installments (transaction_id, number, total, amount, due_date, is_paid)
      select v_tx, (p ->> 'number')::int, (p ->> 'total')::int, round((p ->> 'amount')::numeric, 2),
             (p ->> 'due_date')::timestamptz, false
        from jsonb_array_elements(v_l -> 'parcelas') p;
    end if;
  end loop;

  return v_cp;
end $$;

revoke execute on function public.pacote_vender(uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pacote_vender(uuid, uuid, uuid, uuid, uuid, jsonb) to service_role;

-- ─── A comissão da sessão de pacote: na proporção do que o pacote recebeu ────
create or replace function private.comissao_alvo(p_linha uuid)
returns numeric
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_l         public.commission_lines%rowtype;
  v_fracao    numeric := 1;
  v_desconto  numeric := 0;
  v_taxa      numeric := 0;
  v_base      numeric;
  v_valor     numeric;
  v_pago      boolean := false;
  v_estornado boolean := false;
  v_metodo    text;
  v_total     numeric;
  v_recebido  numeric;
begin
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return 0;
  end if;

  if v_l.origem = 'AVULSO' then
    select f.is_paid and coalesce(f.notes, '') <> 'Estornada',
           coalesce(f.notes, '') = 'Estornada',
           coalesce(f.loyalty_discount, 0),
           f.payment_method::text
      into v_pago, v_estornado, v_desconto, v_metodo
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME';
    v_pago      := coalesce(v_pago, false);
    v_estornado := coalesce(v_estornado, false);
    if v_pago then
      v_taxa := private.comissao_taxa_pct(v_l.tenant_id, v_metodo, 1);
    else
      v_desconto := 0;
    end if;
    v_fracao := case
      when v_l.modo = 'PAGAMENTO' then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' or (v_l.origem = 'PACOTE' and v_l.client_package_id is not null) then
    -- O total a receber: a soma dos procedimentos do plano, ou o preço do
    -- pacote na venda (retrato). Pacote vendido antes de 2026-09-30 não tem
    -- preço guardado nem dinheiro ligado: libera inteiro.
    if v_l.origem = 'PLANO' then
      select coalesce(sum(p.price), 0) into v_total
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
       where s.plan_id = v_l.treatment_plan_id;
    else
      select cp.price into v_total from public.client_packages cp where cp.id = v_l.client_package_id;
    end if;
    select coalesce(sum(f.amount), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce((select max(i.total) from public.installments i where i.transaction_id = f.id), 1)))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_taxa
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem = 'PACOTE' and f.client_package_id = v_l.client_package_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    end if;

  else
    -- Pacote sem venda registrada (de antes): pago fora do sistema.
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
  else
    v_base := v_l.preco - least(v_desconto, v_l.preco);
    if v_l.desconta_taxa then
      v_base := v_base - round(v_base * v_taxa / 100, 2);
    end if;
    if v_l.desconta_insumos then
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_valor := round(greatest(v_base, 0) * v_l.regra_valor / 100, 2);
  end if;

  return round(v_valor * v_fracao, 2);
end $$;

revoke execute on function private.comissao_alvo(uuid) from public, anon, authenticated;

-- ─── O gatilho do pagamento também acerta as linhas do pacote ────────────────
create or replace function private.comissoes_do_pagamento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_motivo text;
  v_linha  uuid;
begin
  if new.appointment_id is null and new.treatment_plan_id is null and new.client_package_id is null then
    return new;
  end if;
  v_motivo := case
    when tg_op = 'UPDATE' and coalesce(new.notes, '') = 'Estornada' and coalesce(old.notes, '') <> 'Estornada'
      then 'Estorno do pagamento'
    when new.treatment_plan_id is not null then 'Recebimento do plano'
    when new.client_package_id is not null then 'Recebimento do pacote'
    else 'Pagamento recebido'
  end;
  for v_linha in
    select cl.id from public.commission_lines cl
     where (new.appointment_id is not null and cl.appointment_id = new.appointment_id)
        or (new.treatment_plan_id is not null and cl.treatment_plan_id = new.treatment_plan_id)
        or (new.client_package_id is not null and cl.client_package_id = new.client_package_id)
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, v_motivo, new.id);
  end loop;
  return new;
end $$;

-- ─── A conclusão grava o pacote na linha ─────────────────────────────────────
-- Só o insert das linhas muda (client_package_id vem do app); o resto é o de
-- 20260930000013.
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
    select coalesce(sum(abs(m.quantity) * coalesce(m.unit_cost, p.cost_price, 0)), 0) into v_custo
      from public.stock_movements m
      left join public.products p on p.id = m.product_id
     where m.appointment_id = p_agendamento and m.type = 'PROCEDURE_USAGE';
    select coalesce(sum((l ->> 'preco')::numeric), 0) into v_soma_preco from jsonb_array_elements(v_linhas) l;

    for v_linha in select * from jsonb_array_elements(v_linhas)
    loop
      insert into public.commission_lines
        (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
         client_package_id, regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos,
         preco, custo_insumos)
      values (
        p_tenant, v_unidade, p_agendamento, v_item,
        nullif(v_linha ->> 'procedure_id', '')::uuid, v_prof,
        v_linha ->> 'origem', nullif(v_linha ->> 'treatment_plan_id', '')::uuid,
        -- A sessão de pacote: a do agendamento, lida aqui — não a do navegador.
        case when v_linha ->> 'origem' = 'PACOTE' then v_pacote else null end,
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
