-- Fidelidade — fase 4: validade dos pontos e abrangência por unidade.
--
-- VALIDADE (a rede escolhe: nunca, ou N meses). Cada crédito recebe expires_at
-- quando nasce — congelado: mudar a regra depois não mexe no que já existe. O
-- consumo é FIFO por vencimento, e um cron diário dá baixa do que venceu
-- (lançamento EXPIRACAO).
--
-- A conta do que vence mora numa função só, em forma fechada:
--   vence_até(D) = max(0, Σ lotes com vencimento ≤ D − Σ consumos)
-- Lote = crédito (pontos > 0) ou o ESTORNO_GANHO do próprio lote (que leva a
-- MESMA validade do GANHO que desfaz: o lote estornado zera, em vez de consumir
-- o lote mais antigo). Consumo = todo débito (resgate, voucher, ajuste negativo)
-- e as expirações já lançadas — por isso rodar duas vezes não vence duas vezes.
-- Por que a forma fechada basta: com validade de N meses fixa, a ordem de
-- vencimento é a ordem de chegada, e nenhum débito passa do saldo (as funções
-- conferem); o consumo mais antigo sai dos lotes mais antigos.
--
-- ABRANGÊNCIA por unidade: as funções já conferem o saldo da unidade quando
-- scope_per_branch está ligado (fases 1–3). Aqui entram o saldo por unidade para
-- a tela e a expiração por unidade. A troca de abrangência é travada no servidor
-- depois do primeiro lançamento da rede (actions/fidelidade.ts).
--
-- E loyalty_accounts.balance sai: desde a fase 1 ninguém a lê nem escreve — o
-- saldo é a soma do extrato.

alter table public.loyalty_accounts drop column if exists balance;

-- ─── Quanto vence até uma data ───────────────────────────────────────────────
create or replace function public.fidelidade_a_expirar(p_conta uuid, p_unidade uuid, p_ate timestamptz)
returns int
language sql stable security definer set search_path = ''
as $$
  select greatest(0,
    coalesce(sum(t.points) filter (
      where (t.points > 0 or t.kind = 'ESTORNO_GANHO')
        and t.expires_at is not null and t.expires_at <= p_ate), 0)
    - coalesce(-sum(t.points) filter (where t.points < 0 and t.kind <> 'ESTORNO_GANHO'), 0)
  )::int
  from public.loyalty_transactions t
  where t.loyalty_account_id = p_conta
    and (p_unidade is null or t.branch_id = p_unidade)
$$;

-- Para a tela: quanto do saldo do cliente vence até a data.
create or replace function public.pontos_expirando(p_cliente uuid, p_unidade uuid, p_ate timestamptz)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.fidelidade_a_expirar(a.id, p_unidade, p_ate), 0)
  from public.loyalty_accounts a
  where a.client_id = p_cliente
$$;

-- O saldo de cada unidade (abrangência por unidade).
create or replace function public.saldos_por_unidade(p_cliente uuid)
returns table (branch_id uuid, saldo int)
language sql stable security definer set search_path = ''
as $$
  select t.branch_id, sum(t.points)::int
  from public.loyalty_transactions t
  join public.loyalty_accounts a on a.id = t.loyalty_account_id
  where a.client_id = p_cliente
  group by t.branch_id
$$;

-- ─── A baixa diária do que venceu ────────────────────────────────────────────
-- Chamada pelo cron (/api/cron/fidelidade-expiracao). Só redes com o programa
-- ligado e validade definida. Devolve quantas contas tiveram pontos vencidos.
create or replace function public.expirar_pontos(p_ate timestamptz default now())
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_linha record;
  v_qtd   int;
  v_total int := 0;
begin
  for v_linha in
    select distinct a.id as conta, a.client_id as cliente,
           case when cfg.scope_per_branch then t.branch_id else null end as unidade
      from public.loyalty_transactions t
      join public.loyalty_accounts a on a.id = t.loyalty_account_id
      join public.clients c on c.id = a.client_id
      join public.loyalty_configs cfg on cfg.tenant_id = c.tenant_id
     where cfg.enabled and cfg.expiry_months is not null
       and t.expires_at is not null and t.expires_at <= p_ate
  loop
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_linha.cliente::text));
    v_qtd := public.fidelidade_a_expirar(v_linha.conta, v_linha.unidade, p_ate);
    if v_qtd > 0 then
      insert into public.loyalty_transactions (loyalty_account_id, branch_id, kind, points, description, created_by)
      values (
        v_linha.conta,
        coalesce(v_linha.unidade, (
          select t2.branch_id from public.loyalty_transactions t2
           where t2.loyalty_account_id = v_linha.conta
           order by t2.created_at desc limit 1)),
        'EXPIRACAO', -v_qtd, 'Pontos vencidos', 'sistema'
      );
      v_total := v_total + 1;
    end if;
  end loop;
  return v_total;
end;
$$;

-- ─── Estorno: o ESTORNO_GANHO leva a validade do lote que desfaz ─────────────
-- Corpo inteiro de 20260929000003; muda só o insert do ESTORNO_GANHO.
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
  v_resgate public.loyalty_transactions%rowtype;
  v_meses   int;
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
    select l.* into v_resgate
      from public.loyalty_transactions l
     where l.transaction_id = p_transacao and l.kind = 'RESGATE';

    if v_ganho.id is not null or v_resgate.id is not null
       or exists (select 1 from public.loyalty_vouchers v where v.used_transaction_id = p_transacao) then
      perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_tx.client_id::text));
    end if;

    if v_ganho.id is not null then
      insert into public.loyalty_transactions (
        loyalty_account_id, branch_id, kind, points, description,
        transaction_id, appointment_id, treatment_plan_id, expires_at, created_by
      ) values (
        v_ganho.loyalty_account_id, v_ganho.branch_id, 'ESTORNO_GANHO', -v_ganho.points,
        'Estorno: ' || v_tx.description,
        v_novo_id, v_ganho.appointment_id, v_ganho.treatment_plan_id, v_ganho.expires_at, p_ator
      );
    end if;

    if v_resgate.id is not null then
      select c.expiry_months into v_meses from public.loyalty_configs c where c.tenant_id = p_tenant;
      insert into public.loyalty_transactions (
        loyalty_account_id, branch_id, kind, points, description,
        transaction_id, appointment_id, expires_at, created_by
      ) values (
        v_resgate.loyalty_account_id, v_resgate.branch_id, 'ESTORNO_RESGATE', -v_resgate.points,
        'Estorno: ' || v_tx.description,
        v_novo_id, v_resgate.appointment_id,
        case when v_meses is null then null else now() + make_interval(months => v_meses) end,
        p_ator
      );
    end if;

    update public.loyalty_vouchers
       set status = 'ATIVO', used_at = null, used_transaction_id = null
     where used_transaction_id = p_transacao and status = 'USADO';
  end if;

  return v_novo_id;
end;
$$;

revoke execute on function public.fidelidade_a_expirar(uuid, uuid, timestamptz) from public, anon, authenticated;
grant  execute on function public.fidelidade_a_expirar(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.pontos_expirando(uuid, uuid, timestamptz) from public, anon, authenticated;
grant  execute on function public.pontos_expirando(uuid, uuid, timestamptz) to service_role;
revoke execute on function public.saldos_por_unidade(uuid) from public, anon, authenticated;
grant  execute on function public.saldos_por_unidade(uuid) to service_role;
revoke execute on function public.expirar_pontos(timestamptz) from public, anon, authenticated;
grant  execute on function public.expirar_pontos(timestamptz) to service_role;
revoke execute on function public.estornar_transacao(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.estornar_transacao(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
