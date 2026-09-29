-- Fidelidade configurável pela rede — fase 1: configuração, ganho no PAGAMENTO,
-- extrato e ajuste manual.
--
-- Até aqui o ponto nascia na conclusão do atendimento (finishSession →
-- concluir_atendimento, passo 4) sobre o PREÇO, só se a rede tivesse uma linha em
-- loyalty_configs — e nenhuma tinha, nem havia tela que a criasse. Decisões do
-- Heitor (2026-09-28):
--  - o programa é da rede: desligado por padrão, e cada rede configura;
--  - o ganho é por real PAGO ou por pontos fixos do procedimento (um modo só);
--  - o ponto nasce quando a receita é PAGA (atendimento concluído e não pago não
--    é dinheiro que entrou) e o estorno o tira de volta;
--  - ajuste manual pela equipe, com motivo.
--
-- Molde: o crédito interno (20260927000006) — gatilho em financial_transactions,
-- trava por cliente, saldo = SOMA do extrato, lançamento negativo ligado à
-- transação, índice único contra processar duas vezes, estorno que devolve.
--
-- Nenhum ponto nem config existe em produção (conferido): dá para remodelar sem
-- migrar dado.

-- ─── Configuração da rede ────────────────────────────────────────────────────
alter table public.loyalty_configs
  alter column points_per_real     type numeric(12,4) using points_per_real::numeric,
  alter column redeem_points_value type numeric(12,4) using redeem_points_value::numeric,
  add column enabled           boolean       not null default false,
  add column earn_mode         text          not null default 'POR_REAL',
  add column redeem_min_points int           not null default 0,
  add column redeem_max_pct    numeric(5,2)  not null default 100,
  add column expiry_months     int,
  add column commission_base   text          not null default 'PRECO',
  add column created_at        timestamptz   not null default now(),
  add column updated_at        timestamptz   not null default now(),
  add column updated_by        text,
  drop column first_app_login_bonus;

alter table public.loyalty_configs
  add constraint loyalty_configs_earn_mode_check       check (earn_mode in ('POR_REAL', 'POR_PROCEDIMENTO')),
  add constraint loyalty_configs_commission_base_check check (commission_base in ('PRECO', 'VALOR_PAGO')),
  add constraint loyalty_configs_points_per_real_check check (points_per_real >= 0),
  add constraint loyalty_configs_redeem_value_check    check (redeem_points_value >= 0),
  add constraint loyalty_configs_redeem_min_check      check (redeem_min_points >= 0),
  add constraint loyalty_configs_redeem_max_pct_check  check (redeem_max_pct between 0 and 100),
  add constraint loyalty_configs_expiry_months_check   check (expiry_months is null or expiry_months between 1 and 120);

-- Escrita só pelo servidor (actions/fidelidade.ts, com a permissão conferida lá).
drop policy if exists "loyalty_configs_update" on public.loyalty_configs;

-- ─── Pontos fixos por procedimento ───────────────────────────────────────────
alter table public.procedures
  add column loyalty_points int check (loyalty_points is null or loyalty_points >= 0);

comment on column public.procedures.loyalty_points is
  'Pontos de fidelidade que o pagamento deste procedimento gera, quando a rede usa o modo POR_PROCEDIMENTO. Nulo = 0.';

-- ─── Extrato ─────────────────────────────────────────────────────────────────
-- A tabela está vazia: as colunas obrigatórias entram sem valor padrão.
alter table public.loyalty_transactions
  add column branch_id         uuid not null references public.branches(id),
  add column kind              text not null,
  add column transaction_id    uuid references public.financial_transactions(id),
  add column voucher_id        uuid,
  add column treatment_plan_id uuid references public.treatment_plans(id),
  add column expires_at        timestamptz,
  add column created_by        text;

alter table public.loyalty_transactions
  add constraint loyalty_transactions_kind_check check (kind in (
    'GANHO', 'ESTORNO_GANHO', 'AJUSTE', 'RESGATE', 'ESTORNO_RESGATE',
    'VOUCHER', 'VOUCHER_CANCELADO', 'EXPIRACAO'
  )),
  add constraint loyalty_transactions_points_check check (points <> 0),
  add constraint loyalty_transactions_appointment_id_fkey
    foreign key (appointment_id) references public.appointments(id) on delete set null;

-- Um pagamento credita uma vez, e o estorno dele estorna uma vez.
create unique index uniq_fidelidade_por_lancamento
  on public.loyalty_transactions (transaction_id, kind)
  where transaction_id is not null;

create index idx_loyalty_transactions_conta_unidade
  on public.loyalty_transactions (loyalty_account_id, branch_id);

comment on table public.loyalty_transactions is
  'Extrato de pontos. O SALDO é a soma (saldo_de_pontos); loyalty_accounts.balance não é mais lido. Escrita só pelo servidor/gatilho.';

-- ─── RLS: extrato e conta só se LEEM pela sessão ─────────────────────────────
-- A equipe gravava no extrato direto pela chave pública (política ALL): pontos
-- se davam sem pagamento nem motivo. Agora quem escreve é o banco (gatilho) e o
-- servidor (ajustar_pontos), com a regra e a trava.
drop policy if exists "loyalty_transactions_operacional" on public.loyalty_transactions;
create policy "loyalty_transactions_select" on public.loyalty_transactions for select
  using (
    (public.jwt_claim('role') <> 'CLIENT' and private.conta_de_pontos_da_minha_rede(loyalty_account_id))
    or (public.jwt_claim('role') = 'CLIENT' and exists (
      select 1 from public.loyalty_accounts la
      where la.id = loyalty_transactions.loyalty_account_id
        and la.client_id::text = public.jwt_claim('client_id')))
  );

drop policy if exists "loyalty_accounts_insert" on public.loyalty_accounts;
drop policy if exists "loyalty_accounts_update" on public.loyalty_accounts;
drop policy if exists "loyalty_accounts_delete" on public.loyalty_accounts;

-- ─── A conta do cliente, criada sob demanda ──────────────────────────────────
create or replace function public.fidelidade_conta(p_cliente uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_conta uuid;
begin
  insert into public.loyalty_accounts (client_id) values (p_cliente)
  on conflict (client_id) do nothing;
  select la.id into v_conta from public.loyalty_accounts la where la.client_id = p_cliente;
  return v_conta;
end;
$$;

-- ─── O saldo: a soma do extrato ──────────────────────────────────────────────
-- p_unidade nulo = rede inteira; preenchido = só os pontos daquela unidade (a
-- abrangência por unidade, fase 4).
create or replace function public.saldo_de_pontos(p_cliente uuid, p_unidade uuid default null)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(t.points), 0)::int
  from public.loyalty_transactions t
  join public.loyalty_accounts a on a.id = t.loyalty_account_id
  where a.client_id = p_cliente
    and (p_unidade is null or t.branch_id = p_unidade)
$$;

-- ─── A regra de ganho — ÚNICA cópia ──────────────────────────────────────────
-- Chamada pelo gatilho, com a trava do cliente já tomada.
--  - Plano: CUMULATIVO pelo que já foi pago do plano (entrada + restante somam
--    exatamente o total do plano, sem erro de arredondamento). Por real: sobre o
--    pago; por procedimento: pontos do plano × fração paga.
--  - Atendimento: por real, sobre o valor pago; por procedimento, os pontos do
--    procedimento dele.
--  - Outra receita: por real; por procedimento, nada.
create or replace function public.fidelidade_pontos_do_pagamento(
  p_tx  public.financial_transactions,
  p_cfg public.loyalty_configs
)
returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_total     numeric;
  v_pago      numeric;
  v_ja        int;
  v_plano_pts numeric;
  v_alvo      int;
begin
  if p_tx.treatment_plan_id is not null then
    select coalesce(sum(i.unit_price * i.sessions), 0)
      into v_total
      from public.treatment_plan_items i
     where i.plan_id = p_tx.treatment_plan_id;

    select coalesce(sum(f.amount), 0)
      into v_pago
      from public.financial_transactions f
     where f.treatment_plan_id = p_tx.treatment_plan_id
       and f.type = 'INCOME'
       and f.is_paid
       and f.category <> 'Estorno'
       and coalesce(f.notes, '') <> 'Estornada'
       and f.payment_method is distinct from 'INTERNAL_CREDIT';

    select coalesce(sum(l.points), 0)::int
      into v_ja
      from public.loyalty_transactions l
     where l.treatment_plan_id = p_tx.treatment_plan_id
       and l.kind in ('GANHO', 'ESTORNO_GANHO');

    if p_cfg.earn_mode = 'POR_PROCEDIMENTO' then
      select coalesce(sum(coalesce(pr.loyalty_points, 0) * i.sessions), 0)
        into v_plano_pts
        from public.treatment_plan_items i
        join public.procedures pr on pr.id = i.procedure_id
       where i.plan_id = p_tx.treatment_plan_id
         and i.service_package_id is null;
      -- Multiplica ANTES de dividir: 120 × (100 ÷ 300) dá 39,999… e o floor
      -- perdia um ponto; 120 × 100 ÷ 300 dá 40 exatos.
      v_alvo := case when v_total > 0
                     then floor(v_plano_pts * least(v_pago, v_total) / v_total)::int
                     else 0 end;
    else
      v_alvo := floor(v_pago * p_cfg.points_per_real)::int;
    end if;

    return greatest(v_alvo - v_ja, 0);
  end if;

  if p_cfg.earn_mode = 'POR_PROCEDIMENTO' then
    if p_tx.appointment_id is null then
      return 0;
    end if;
    select coalesce(pr.loyalty_points, 0)
      into v_alvo
      from public.appointments ap
      join public.procedures pr on pr.id = ap.procedure_id
     where ap.id = p_tx.appointment_id;
    return coalesce(v_alvo, 0);
  end if;

  return floor(p_tx.amount * p_cfg.points_per_real)::int;
end;
$$;

-- ─── O gatilho: o ponto nasce no pagamento ───────────────────────────────────
-- Nunca lança por falta de config ou programa desligado: um pagamento não pode
-- falhar por causa da fidelidade.
create or replace function public.on_transaction_loyalty_earn()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_rede   uuid;
  v_cfg    public.loyalty_configs%rowtype;
  v_pontos int;
  v_conta  uuid;
  v_linha  uuid;
  v_saldo  int;
  v_nome   text;
begin
  if not coalesce(new.is_paid, false) then return null; end if;
  if tg_op = 'UPDATE' and old.is_paid then return null; end if;
  if new.type <> 'INCOME' or new.category = 'Estorno' then return null; end if;
  if new.client_id is null or new.amount <= 0 then return null; end if;
  -- Crédito interno é dinheiro que o cliente já tinha: não gera ponto de novo.
  if new.payment_method is not distinct from 'INTERNAL_CREDIT' then return null; end if;

  select b.tenant_id into v_rede from public.branches b where b.id = new.branch_id;
  if v_rede is null then return null; end if;

  select * into v_cfg from public.loyalty_configs c where c.tenant_id = v_rede and c.enabled;
  if not found then return null; end if;

  perform pg_advisory_xact_lock(hashtext('fidelidade:' || new.client_id::text));

  v_pontos := public.fidelidade_pontos_do_pagamento(new, v_cfg);
  if coalesce(v_pontos, 0) <= 0 then return null; end if;

  v_conta := public.fidelidade_conta(new.client_id);

  insert into public.loyalty_transactions (
    loyalty_account_id, branch_id, kind, points, description,
    transaction_id, appointment_id, treatment_plan_id, expires_at, created_by
  ) values (
    v_conta, new.branch_id, 'GANHO', v_pontos, 'Pagamento: ' || new.description,
    new.id, new.appointment_id, new.treatment_plan_id,
    case when v_cfg.expiry_months is null then null
         else coalesce(new.paid_at, now()) + make_interval(months => v_cfg.expiry_months) end,
    'sistema'
  )
  on conflict (transaction_id, kind) where transaction_id is not null do nothing
  returning id into v_linha;

  if v_linha is null then return null; end if;

  v_saldo := public.saldo_de_pontos(new.client_id,
               case when v_cfg.scope_per_branch then new.branch_id else null end);
  select c.name into v_nome from public.clients c where c.id = new.client_id;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    v_rede, new.branch_id, 'fidelidade.pontos_ganhos', 'fidelidade', v_linha,
    jsonb_build_object(
      'clienteId', new.client_id, 'clienteNome', v_nome, 'pontos', v_pontos,
      'saldo', v_saldo, 'pagamentoId', new.id, 'valor', new.amount
    ),
    'sistema', 'banco', 'fidelidade.pontos_ganhos:' || new.id,
    coalesce(new.paid_at, now())
  )
  on conflict (tenant_id, chave) where chave is not null do nothing;

  return null;
end;
$$;

drop trigger if exists trg_fidelidade_ganho on public.financial_transactions;
create trigger trg_fidelidade_ganho
  after insert or update of is_paid on public.financial_transactions
  for each row execute function public.on_transaction_loyalty_earn();

-- ─── Ajuste manual, com motivo ───────────────────────────────────────────────
create or replace function public.ajustar_pontos(
  p_tenant  uuid,
  p_cliente uuid,
  p_unidade uuid,
  p_pontos  int,
  p_motivo  text,
  p_ator    text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg   public.loyalty_configs%rowtype;
  v_saldo int;
  v_conta uuid;
  v_linha uuid;
begin
  if not exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant) then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;

  select * into v_cfg from public.loyalty_configs c where c.tenant_id = p_tenant and c.enabled;
  if not found then
    raise exception 'O programa de fidelidade está desligado nesta rede.' using errcode = 'P0001';
  end if;

  if coalesce(p_pontos, 0) = 0 then
    raise exception 'Informe quantos pontos creditar ou debitar.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'O motivo do ajuste é obrigatório.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('fidelidade:' || p_cliente::text));

  if p_pontos < 0 then
    v_saldo := public.saldo_de_pontos(p_cliente,
                 case when v_cfg.scope_per_branch then p_unidade else null end);
    if v_saldo < -p_pontos then
      raise exception 'Saldo insuficiente: o cliente tem % pontos.', v_saldo using errcode = 'P0001';
    end if;
  end if;

  v_conta := public.fidelidade_conta(p_cliente);

  insert into public.loyalty_transactions (
    loyalty_account_id, branch_id, kind, points, description, expires_at, created_by
  ) values (
    v_conta, p_unidade, 'AJUSTE', p_pontos, trim(p_motivo),
    case when p_pontos > 0 and v_cfg.expiry_months is not null
         then now() + make_interval(months => v_cfg.expiry_months) end,
    p_ator
  )
  returning id into v_linha;

  return v_linha;
end;
$$;

-- ─── Estorno: tira os pontos que aquele pagamento deu ────────────────────────
-- Corpo inteiro de 20260927000006 + o bloco da fidelidade. Tira exatamente o que
-- foi creditado (lê o GANHO; não recalcula). Se o cliente já gastou, o saldo fica
-- negativo — como estoque — e só volta a resgatar quando ficar positivo.
create or replace function public.estornar_transacao(p_transacao uuid, p_tenant uuid, p_ator text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_tx      public.financial_transactions%rowtype;
  v_tenant  uuid;
  v_novo_id uuid;
  v_ganho   public.loyalty_transactions%rowtype;
begin
  select t.* into v_tx
  from public.financial_transactions t
  where t.id = p_transacao
  for update;

  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'no_data_found';
  end if;

  select b.tenant_id into v_tenant
  from public.branches b where b.id = v_tx.branch_id;

  if v_tenant is distinct from p_tenant then
    raise exception 'Lançamento não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_tx.notes = 'Estornada' then
    raise exception 'Este lançamento já foi estornado.' using errcode = 'invalid_parameter_value';
  end if;

  if v_tx.category = 'Estorno' then
    raise exception 'Um estorno não se estorna — para desfazer, fale com o financeiro.' using errcode = 'invalid_parameter_value';
  end if;

  if not v_tx.is_paid then
    raise exception 'Lançamento ainda não pago: não há o que estornar.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.financial_transactions (
    branch_id, client_id, appointment_id, treatment_plan_id,
    type, category, description, amount,
    is_paid, paid_at, created_by
  ) values (
    v_tx.branch_id, v_tx.client_id, null, v_tx.treatment_plan_id,
    case when v_tx.type = 'INCOME' then 'EXPENSE' else 'INCOME' end::public."TransactionType",
    'Estorno',
    'Estorno: ' || v_tx.description,
    v_tx.amount,
    true, now(), p_ator
  )
  returning id into v_novo_id;

  update public.financial_transactions
     set notes = 'Estornada', updated_at = now()
   where id = p_transacao;

  if v_tx.payment_method = 'INTERNAL_CREDIT' and v_tx.type = 'INCOME' and v_tx.client_id is not null then
    insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
    values (v_tx.client_id, v_tx.branch_id, v_tx.amount, 'Estorno: ' || v_tx.description, v_novo_id);
  end if;

  if v_tx.type = 'INCOME' and v_tx.client_id is not null then
    select l.* into v_ganho
      from public.loyalty_transactions l
     where l.transaction_id = p_transacao and l.kind = 'GANHO';
    if found then
      perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_tx.client_id::text));
      insert into public.loyalty_transactions (
        loyalty_account_id, branch_id, kind, points, description,
        transaction_id, appointment_id, treatment_plan_id, created_by
      ) values (
        v_ganho.loyalty_account_id, v_ganho.branch_id, 'ESTORNO_GANHO', -v_ganho.points,
        'Estorno: ' || v_tx.description,
        v_novo_id, v_ganho.appointment_id, v_ganho.treatment_plan_id, p_ator
      );
    end if;
  end if;

  return v_novo_id;
end;
$$;

-- ─── Conclusão do atendimento: sem pontos ────────────────────────────────────
-- Corpo inteiro de 20260928000003 menos o passo 4: o ponto nasce no pagamento.
-- `p_dados.pontos`, se vier, é ignorado.
create or replace function public.concluir_atendimento(
  p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_status     text;
  v_unidade    uuid;
  v_cliente    uuid;
  v_prof       uuid;
  v_rede       uuid;
  v_prontuario uuid;
  v_comissao   jsonb := p_dados -> 'comissao';
  v_insumo     jsonb;
  v_sessao     uuid;
  v_pacote     uuid;
  v_nova_com   boolean := false;
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

  if v_comissao is not null and jsonb_typeof(v_comissao) = 'object'
     and not exists (select 1 from public.commissions where appointment_id = p_agendamento) then
    insert into public.commissions
      (branch_id, professional_id, appointment_id, amount, type, rule_value, period_ref, status)
    values (
      v_unidade, v_prof, p_agendamento,
      (v_comissao ->> 'valor')::numeric,
      (v_comissao ->> 'tipo')::"CommissionType",
      (v_comissao ->> 'regra')::numeric,
      v_comissao ->> 'periodo',
      'OPEN'
    );
    v_nova_com := true;
  end if;

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

  if p_ator is not null then
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'COMPLETED', 'Atendimento concluído pelo profissional');
  end if;

  return jsonb_build_object('comissao_criada', v_nova_com, 'pacote', v_pacote);
end
$$;

-- ─── Acesso ──────────────────────────────────────────────────────────────────
revoke execute on function public.fidelidade_conta(uuid) from public, anon, authenticated;
grant  execute on function public.fidelidade_conta(uuid) to service_role;
revoke execute on function public.saldo_de_pontos(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.saldo_de_pontos(uuid, uuid) to service_role;
revoke execute on function public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs) from public, anon, authenticated;
grant  execute on function public.fidelidade_pontos_do_pagamento(public.financial_transactions, public.loyalty_configs) to service_role;
revoke execute on function public.on_transaction_loyalty_earn() from public, anon, authenticated;
revoke execute on function public.ajustar_pontos(uuid, uuid, uuid, int, text, text) from public, anon, authenticated;
grant  execute on function public.ajustar_pontos(uuid, uuid, uuid, int, text, text) to service_role;
revoke execute on function public.estornar_transacao(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.estornar_transacao(uuid, uuid, text) to service_role;
revoke execute on function public.concluir_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.concluir_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;

-- ─── Módulo de permissão ─────────────────────────────────────────────────────
-- `loyalty` volta ao catálogo (saiu em 20260909000008 por não ter trava nenhuma).
-- Herda o nível de `clients`: quem cuida do cliente vê e mexe nos pontos dele.
-- Nenhum comportamento muda sem decisão: o programa nasce desligado.
insert into public.role_permissions (tenant_id, role_id, module, level, scope)
select tenant_id, role_id, 'loyalty', level, 'ALL'
  from public.role_permissions
 where module = 'clients'
on conflict (role_id, module) do nothing;

notify pgrst, 'reload schema';
