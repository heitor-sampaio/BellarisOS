-- Procedimento pré-pago (decisão do Heitor, 2026-09-30): o cliente compra N
-- unidades de UM procedimento, paga (ou fica a receber) e agenda depois. É
-- SEPARADO do pacote de propósito — o Heitor recusou reaproveitar
-- client_packages: pacote é um conjunto vendido por um preço só, o pré-pago é o
-- procedimento avulso pago antes.
--
-- - A venda (`procedure_sales`) guarda o RETRATO: preço de tabela, desconto,
--   vendido, validade (opcional) e quem vendeu.
-- - Cada unidade (`procedure_sale_units`) tem a sua parte do preço (a base da
--   comissão dela) e o agendamento que a usa.
-- - Falta ou cancelamento do agendamento DEVOLVE a unidade (pode remarcar).
-- - Cancelar a unidade registra a devolução do que o cliente pagou a mais
--   (e, se ainda devia, reduz o a receber antes).
--
-- O app calcula; as funções gravam numa transação e conferem as somas.

-- ─── 1. Tabelas ──────────────────────────────────────────────────────────────
create table if not exists public.procedure_sales (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  branch_id     uuid not null references public.branches(id),
  client_id     uuid not null references public.clients(id),
  procedure_id  uuid not null references public.procedures(id),
  quantity      int  not null check (quantity between 1 and 100),
  preco_unitario_tabela numeric(12,2) not null check (preco_unitario_tabela >= 0),
  preco_tabela  numeric(12,2) not null check (preco_tabela >= 0),
  desconto      numeric(12,2) not null default 0 check (desconto >= 0),
  price         numeric(12,2) not null check (price >= 0),
  expires_at    timestamptz,
  sold_by       uuid references public.users(id) on delete set null,
  sold_at       timestamptz not null default now(),
  check (price = preco_tabela - desconto)
);
comment on table public.procedure_sales is
  'Venda de procedimento pré-pago: N unidades de UM procedimento, pagas antes. Separada do pacote (decisão do Heitor, 2026-09-30).';
comment on column public.procedure_sales.price is 'Preço VENDIDO (tabela − desconto): o total a receber e a base do rateio das unidades.';

create index if not exists procedure_sales_cliente on public.procedure_sales (tenant_id, client_id);
create index if not exists procedure_sales_unidade on public.procedure_sales (branch_id);

create table if not exists public.procedure_sale_units (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null references public.procedure_sales(id) on delete cascade,
  numero         int  not null check (numero >= 1),
  preco          numeric(12,2) not null check (preco >= 0),
  status         text not null default 'DISPONIVEL' check (status in ('DISPONIVEL', 'USADA', 'CANCELADA')),
  appointment_id uuid references public.appointments(id) on delete set null,
  used_at        timestamptz,
  cancelled_at   timestamptz,
  cancelled_by   uuid references public.users(id) on delete set null,
  cancel_reason  text,
  unique (sale_id, numero)
);
comment on column public.procedure_sale_units.preco is 'A parte desta unidade no preço vendido (rateio igual, em centavos): a base da comissão dela.';
comment on column public.procedure_sale_units.appointment_id is
  'O agendamento que usa esta unidade. Cancelar o agendamento ou marcar falta devolve a unidade (gatilho trg_pre_pago_libera).';

create unique index if not exists procedure_sale_units_agendamento
  on public.procedure_sale_units (appointment_id) where appointment_id is not null;

alter table public.financial_transactions
  add column if not exists procedure_sale_id uuid references public.procedure_sales(id) on delete set null;
create index if not exists financial_transactions_procedure_sale
  on public.financial_transactions (procedure_sale_id) where procedure_sale_id is not null;

alter table public.commission_lines
  add column if not exists procedure_sale_id uuid references public.procedure_sales(id) on delete set null;
alter table public.commission_lines drop constraint if exists commission_lines_origem_check;
alter table public.commission_lines add constraint commission_lines_origem_check
  check (origem in ('AVULSO', 'PLANO', 'PACOTE', 'PRE_PAGO'));

-- A sessão só LÊ (a equipe que alcança a unidade, e o cliente o que é dele);
-- quem escreve são as funções abaixo, pelo servidor.
alter table public.procedure_sales enable row level security;
alter table public.procedure_sale_units enable row level security;

drop policy if exists procedure_sales_select on public.procedure_sales;
create policy procedure_sales_select on public.procedure_sales for select using (
  (jwt_claim('role') <> 'CLIENT' and tenant_id::text = jwt_claim('tenant_id') and private.can_access_branch(branch_id))
  or (jwt_claim('role') = 'CLIENT' and client_id = (select c.id from public.clients c where c.auth_id = (select auth.uid())::text limit 1))
);
drop policy if exists procedure_sale_units_select on public.procedure_sale_units;
create policy procedure_sale_units_select on public.procedure_sale_units for select using (
  exists (select 1 from public.procedure_sales s where s.id = sale_id)
);

-- ─── 2. Vender ───────────────────────────────────────────────────────────────
-- p_unidades: [{ preco }] — uma por unidade, o rateio que o app calculou.
create or replace function public.procedimento_vender(
  p_tenant uuid, p_cliente uuid, p_procedimento uuid, p_unidade uuid, p_ator uuid,
  p_quantidade int, p_desconto numeric, p_validade_dias int, p_lancamentos jsonb, p_unidades jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_proc     public.procedures%rowtype;
  v_venda    uuid;
  v_tabela   numeric;
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido  numeric;
  v_l        jsonb;
  v_tx       uuid;
  v_agora    timestamptz := now();
begin
  select * into v_proc from public.procedures p where p.id = p_procedimento and p.tenant_id = p_tenant;
  if not found then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  if not coalesce(v_proc.is_active, true) then
    raise exception 'Este procedimento está desativado.' using errcode = 'P0001';
  end if;
  if v_proc.branch_id is not null and v_proc.branch_id <> p_unidade then
    raise exception 'Este procedimento é de outra unidade.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant) then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then
    raise exception 'Quantidade inválida (de 1 a 100).' using errcode = 'P0001';
  end if;
  if p_validade_dias is not null and (p_validade_dias < 1 or p_validade_dias > 3650) then
    raise exception 'Validade inválida.' using errcode = 'P0001';
  end if;

  v_tabela := round(coalesce(v_proc.price, 0), 2) * p_quantidade;
  if v_desconto < 0 or v_desconto > v_tabela then
    raise exception 'O desconto não pode ser maior que o valor da venda.' using errcode = 'P0001';
  end if;
  v_vendido := v_tabela - v_desconto;

  if (select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l) <> v_vendido then
    raise exception 'O pagamento não fecha com o valor da venda.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_unidades) <> 'array' or jsonb_array_length(p_unidades) <> p_quantidade
     or exists (select 1 from jsonb_array_elements(p_unidades) u where round((u ->> 'preco')::numeric, 2) < 0)
     or (select coalesce(sum(round((u ->> 'preco')::numeric, 2)), 0) from jsonb_array_elements(p_unidades) u) <> v_vendido then
    raise exception 'O rateio das unidades não fecha com o valor da venda.' using errcode = 'P0001';
  end if;

  insert into public.procedure_sales
    (tenant_id, branch_id, client_id, procedure_id, quantity, preco_unitario_tabela, preco_tabela,
     desconto, price, expires_at, sold_by, sold_at)
  values (
    p_tenant, p_unidade, p_cliente, p_procedimento, p_quantidade, round(coalesce(v_proc.price, 0), 2), v_tabela,
    v_desconto, v_vendido,
    case when p_validade_dias is null then null else v_agora + make_interval(days => p_validade_dias) end,
    p_ator, v_agora
  ) returning id into v_venda;

  insert into public.procedure_sale_units (sale_id, numero, preco)
  select v_venda, n::int, round((u ->> 'preco')::numeric, 2)
    from jsonb_array_elements(p_unidades) with ordinality as t(u, n);

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, procedure_sale_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by)
    values (
      p_unidade, p_cliente, v_venda, 'INCOME', 'Serviços',
      'Procedimento pré-pago — ' || p_quantidade || '× ' || v_proc.name,
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

  return v_venda;
end $$;

revoke execute on function public.procedimento_vender(uuid, uuid, uuid, uuid, uuid, int, numeric, int, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.procedimento_vender(uuid, uuid, uuid, uuid, uuid, int, numeric, int, jsonb, jsonb) to service_role;

-- ─── 3. Cancelar uma unidade: registra a devolução ───────────────────────────
-- O que a venda passa a valer = vendido − unidades canceladas. Se o cliente
-- ainda devia, o a receber diminui primeiro (do último para o primeiro); o que
-- ele pagou além do que passou a valer vira uma DEVOLUÇÃO a pagar no
-- financeiro (despesa não paga, categoria "Devolução"), para a clínica fazer.
create or replace function public.procedimento_cancelar_unidade(
  p_tenant uuid, p_unidade uuid, p_ator uuid, p_motivo text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_u         public.procedure_sale_units%rowtype;
  v_venda     public.procedure_sales%rowtype;
  v_ag_status text;
  v_valor     numeric;
  v_pago      numeric;
  v_aberto    numeric;
  v_devolvido numeric;
  v_cortar    numeric;
  v_devolver  numeric;
  v_tx        record;
  v_parc      record;
  v_corte     numeric;
  v_resto     numeric;
  v_reduzido  numeric := 0;
  v_nome      text;
begin
  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  select * into v_u from public.procedure_sale_units u where u.id = p_unidade for update;
  if not found then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select * into v_venda from public.procedure_sales s where s.id = v_u.sale_id for update;
  if v_venda.tenant_id is distinct from p_tenant then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_u.status <> 'DISPONIVEL' then
    raise exception 'Só uma unidade ainda disponível pode ser cancelada.' using errcode = 'P0001';
  end if;
  if v_u.appointment_id is not null then
    select a.status::text into v_ag_status from public.appointments a where a.id = v_u.appointment_id;
    if v_ag_status is not null and v_ag_status not in ('CANCELLED', 'NO_SHOW') then
      raise exception 'Esta unidade está agendada: cancele o agendamento antes.' using errcode = 'P0001';
    end if;
  end if;

  update public.procedure_sale_units
     set status = 'CANCELADA', cancelled_at = now(), cancelled_by = p_ator,
         cancel_reason = trim(p_motivo), appointment_id = null
   where id = v_u.id;

  select v_venda.price - coalesce(sum(u.preco), 0) into v_valor
    from public.procedure_sale_units u where u.sale_id = v_venda.id and u.status = 'CANCELADA';

  select coalesce(sum(f.amount) filter (where f.is_paid), 0),
         coalesce(sum(f.amount) filter (where not f.is_paid), 0)
    into v_pago, v_aberto
    from public.financial_transactions f
   where f.procedure_sale_id = v_venda.id and f.type = 'INCOME'
     and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
  select coalesce(sum(f.amount), 0) into v_devolvido
    from public.financial_transactions f
   where f.procedure_sale_id = v_venda.id and f.type = 'EXPENSE' and f.category = 'Devolução'
     and coalesce(f.notes, '') <> 'Estornada';

  -- 1. O a receber que passou do novo valor diminui (o mais novo primeiro).
  v_cortar := least(v_aberto, greatest(0, v_pago + v_aberto - v_valor));
  for v_tx in
    select f.id, f.amount from public.financial_transactions f
     where f.procedure_sale_id = v_venda.id and f.type = 'INCOME' and not f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno' and f.amount > 0
     order by f.due_date desc nulls first, f.created_at desc
     for update
  loop
    exit when v_cortar <= 0;
    v_corte := least(v_cortar, v_tx.amount);
    update public.financial_transactions set amount = amount - v_corte, updated_at = now() where id = v_tx.id;
    -- As parcelas em aberto acompanham, da última para a primeira.
    v_resto := v_corte;
    for v_parc in
      select i.id, i.amount from public.installments i
       where i.transaction_id = v_tx.id and not coalesce(i.is_paid, false) and i.amount > 0
       order by i.number desc
       for update
    loop
      exit when v_resto <= 0;
      update public.installments set amount = amount - least(v_resto, v_parc.amount) where id = v_parc.id;
      v_resto := v_resto - least(v_resto, v_parc.amount);
    end loop;
    v_cortar := v_cortar - v_corte;
    v_reduzido := v_reduzido + v_corte;
  end loop;

  -- 2. O que foi pago além do novo valor: a devolver.
  v_devolver := greatest(0, v_pago - v_valor) - v_devolvido;
  if v_devolver > 0 then
    select p.name into v_nome from public.procedures p where p.id = v_venda.procedure_id;
    insert into public.financial_transactions
      (branch_id, client_id, procedure_sale_id, type, category, description, amount, is_paid, notes, created_by)
    values (
      v_venda.branch_id, v_venda.client_id, v_venda.id, 'EXPENSE', 'Devolução',
      'Devolução — ' || coalesce(v_nome, 'procedimento pré-pago') || ' (unidade ' || v_u.numero || ' cancelada)',
      v_devolver, false, trim(p_motivo), coalesce(p_ator::text, 'sistema')
    );
  else
    v_devolver := 0;
  end if;

  return jsonb_build_object('devolver', v_devolver, 'reduzido', v_reduzido);
end $$;

revoke execute on function public.procedimento_cancelar_unidade(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.procedimento_cancelar_unidade(uuid, uuid, uuid, text) to service_role;

-- ─── 4. Falta ou cancelamento do agendamento devolve a unidade ───────────────
create or replace function private.pre_pago_libera()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status::text in ('CANCELLED', 'NO_SHOW') and old.status::text is distinct from new.status::text then
    update public.procedure_sale_units
       set appointment_id = null
     where appointment_id = new.id and status = 'DISPONIVEL';
  end if;
  return new;
end $$;
revoke execute on function private.pre_pago_libera() from public, anon, authenticated;

drop trigger if exists trg_pre_pago_libera on public.appointments;
create trigger trg_pre_pago_libera
  after update of status on public.appointments
  for each row execute function private.pre_pago_libera();

-- ─── 5. A conclusão usa a unidade e liga a comissão à venda ──────────────────
do $$
declare
  v_def  text := pg_get_functiondef('public.concluir_atendimento(uuid, uuid, uuid, text, jsonb)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$  v_pacote     uuid;
$a$,
$b$  v_pacote     uuid;
  v_unidade_pp uuid;
  v_venda_pp   uuid;
$b$);
  v_novo := replace(v_novo,
$a$    update public.client_packages set used_sessions = used_sessions + 1 where id = v_pacote;
  end if;
$a$,
$b$    update public.client_packages set used_sessions = used_sessions + 1 where id = v_pacote;
  end if;

  -- Procedimento pré-pago: a unidade ligada a este agendamento é usada.
  select u.id, u.sale_id into v_unidade_pp, v_venda_pp
    from public.procedure_sale_units u
   where u.appointment_id = p_agendamento and u.status = 'DISPONIVEL'
     for update;
  if v_unidade_pp is not null then
    update public.procedure_sale_units set status = 'USADA', used_at = now() where id = v_unidade_pp;
  end if;
$b$);
  v_novo := replace(v_novo,
$a$         client_package_id, regra_tipo,$a$,
$b$         client_package_id, procedure_sale_id, regra_tipo,$b$);
  v_novo := replace(v_novo,
$a$        case when v_linha ->> 'origem' = 'PACOTE' then v_pacote else null end,
$a$,
$b$        case when v_linha ->> 'origem' = 'PACOTE' then v_pacote else null end,
        -- A venda do pré-pago: a da unidade deste agendamento, lida aqui.
        case when v_linha ->> 'origem' = 'PRE_PAGO' then v_venda_pp else null end,
$b$);
  if (length(v_novo) - length(replace(v_novo, 'v_venda_pp', ''))) / length('v_venda_pp') < 3
     or v_novo not like '%procedure_sale_id, regra_tipo%' then
    raise exception 'concluir_atendimento: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

-- ─── 6. A recepção não cobra de novo ─────────────────────────────────────────
do $$
declare
  v_def  text := pg_get_functiondef('public.confirmar_pagamento_do_atendimento(uuid, uuid, uuid, text, jsonb)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$    raise exception 'Sessão de pacote: já foi paga na venda do pacote.' using errcode = 'P0001';
  end if;
$a$,
$b$    raise exception 'Sessão de pacote: já foi paga na venda do pacote.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.procedure_sale_units u where u.appointment_id = p_agendamento and u.status <> 'CANCELADA') then
    raise exception 'Procedimento pré-pago: já foi pago na venda.' using errcode = 'P0001';
  end if;
$b$);
  if v_novo = v_def then
    raise exception 'confirmar_pagamento_do_atendimento: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

-- ─── 7. Comissão: o pré-pago libera na proporção do que a venda recebeu ─────
do $$
declare
  v_def  text := pg_get_functiondef('private.comissao_alvo(uuid)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$  elsif v_l.origem = 'PLANO' or (v_l.origem = 'PACOTE' and v_l.client_package_id is not null) then$a$,
$b$  elsif v_l.origem = 'PLANO' or (v_l.origem = 'PACOTE' and v_l.client_package_id is not null)
        or (v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null) then$b$);
  v_novo := replace(v_novo,
$a$    else
      select cp.price into v_total from public.client_packages cp where cp.id = v_l.client_package_id;
    end if;$a$,
$b$    elsif v_l.origem = 'PACOTE' then
      select cp.price into v_total from public.client_packages cp where cp.id = v_l.client_package_id;
    else
      -- O que a venda vale hoje: o vendido menos as unidades canceladas.
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0)
        into v_total
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;$b$);
  v_novo := replace(v_novo,
$a$         or (v_l.origem = 'PACOTE' and f.client_package_id = v_l.client_package_id))$a$,
$b$         or (v_l.origem = 'PACOTE' and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id))$b$);
  if (length(v_novo) - length(replace(v_novo, 'procedure_sale_id', ''))) / length('procedure_sale_id') < 4 then
    raise exception 'comissao_alvo: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

create or replace function private.comissoes_do_pagamento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_motivo text;
  v_linha  uuid;
begin
  if new.appointment_id is null and new.treatment_plan_id is null and new.client_package_id is null
     and new.procedure_sale_id is null then
    return new;
  end if;
  v_motivo := case
    when tg_op = 'UPDATE' and coalesce(new.notes, '') = 'Estornada' and coalesce(old.notes, '') <> 'Estornada'
      then 'Estorno do pagamento'
    when new.treatment_plan_id is not null then 'Recebimento do plano'
    when new.client_package_id is not null then 'Recebimento do pacote'
    when new.procedure_sale_id is not null then 'Recebimento do pré-pago'
    else 'Pagamento recebido'
  end;
  for v_linha in
    select cl.id from public.commission_lines cl
     where (new.appointment_id is not null and cl.appointment_id = new.appointment_id)
        or (new.treatment_plan_id is not null and cl.treatment_plan_id = new.treatment_plan_id)
        or (new.client_package_id is not null and cl.client_package_id = new.client_package_id)
        or (new.procedure_sale_id is not null and cl.procedure_sale_id = new.procedure_sale_id)
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, v_motivo, new.id);
  end loop;
  return new;
end $$;
revoke execute on function private.comissoes_do_pagamento() from public, anon, authenticated;

-- ─── 8. Fidelidade por procedimento: pré-pago e pacote, cumulativos ─────────
-- Como o plano: os pontos dos procedimentos comprados, na proporção do que foi
-- pago. Antes o pacote (e agora o pré-pago) dava ZERO neste modo, porque o
-- pagamento não tem atendimento.
do $$
declare
  v_def  text := pg_get_functiondef('public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
$a$begin
  if p_tx.treatment_plan_id is not null then$a$,
$b$begin
  if p_cfg.earn_mode = 'POR_PROCEDIMENTO' and (p_tx.procedure_sale_id is not null or p_tx.client_package_id is not null) then
    if p_tx.procedure_sale_id is not null then
      select ps.price - coalesce(sum(u.preco) filter (where u.status = 'CANCELADA'), 0),
             coalesce(pr.loyalty_points, 0) * count(*) filter (where u.status <> 'CANCELADA')
        into v_total, v_plano_pts
        from public.procedure_sales ps
        join public.procedures pr on pr.id = ps.procedure_id
        left join public.procedure_sale_units u on u.sale_id = ps.id
       where ps.id = p_tx.procedure_sale_id
       group by ps.price, pr.loyalty_points;
    else
      select cp.price, coalesce(sum(coalesce(pr.loyalty_points, 0)), 0)
        into v_total, v_plano_pts
        from public.client_packages cp
        left join public.package_sessions s on s.client_package_id = cp.id
        left join public.procedures pr on pr.id = s.procedure_id
       where cp.id = p_tx.client_package_id
       group by cp.price;
    end if;

    select coalesce(sum(f.amount), 0) into v_pago
      from public.financial_transactions f
     where ((p_tx.procedure_sale_id is not null and f.procedure_sale_id = p_tx.procedure_sale_id)
         or (p_tx.procedure_sale_id is null and f.client_package_id = p_tx.client_package_id))
       and f.type = 'INCOME' and f.is_paid
       and f.category <> 'Estorno' and coalesce(f.notes, '') <> 'Estornada'
       and f.payment_method is distinct from 'INTERNAL_CREDIT';

    select coalesce(sum(l.points), 0)::int into v_ja
      from public.loyalty_transactions l
      join public.financial_transactions f on f.id = l.transaction_id
     where ((p_tx.procedure_sale_id is not null and f.procedure_sale_id = p_tx.procedure_sale_id)
         or (p_tx.procedure_sale_id is null and f.client_package_id = p_tx.client_package_id))
       and l.kind in ('GANHO', 'ESTORNO_GANHO');

    v_alvo := case when coalesce(v_total, 0) > 0
                   then floor(coalesce(v_plano_pts, 0) * least(v_pago, v_total) / v_total)::int
                   else 0 end;
    return greatest(v_alvo - v_ja, 0);
  end if;

  if p_tx.treatment_plan_id is not null then$b$);
  if v_novo = v_def then
    raise exception 'fidelidade_pontos_do_pagamento: o trecho esperado não bateu';
  end if;
  execute v_novo;
end $$;

notify pgrst, 'reload schema';
