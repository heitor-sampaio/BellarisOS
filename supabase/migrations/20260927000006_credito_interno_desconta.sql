-- Crédito interno passa a ser DESCONTADO quando usado como forma de pagamento.
--
-- Até aqui `INTERNAL_CREDIT` era só um rótulo em `payment_method`: a receita
-- entrava como paga e o saldo do cliente continuava o mesmo — o crédito podia
-- ser gasto infinitas vezes. Decisão do Heitor (2026-09-27): descontar do saldo
-- e RECUSAR o pagamento se o saldo não cobrir.
--
-- Por GATILHO, e não no TypeScript, pelo mesmo argumento de `pagamento.*`
-- (CLAUDE.md §9.9): receita paga nasce em cinco lugares (atendimento, checkout
-- do plano, recebimento do plano no check-in, baixa manual, novo lançamento).
-- Instrumentar um a um é garantir esquecer o próximo. E é na MESMA transação do
-- pagamento: sem saldo, o pagamento inteiro falha — não fica receita paga sem
-- débito, nem débito sem receita.
--
-- O saldo é a soma de `internal_credits.amount` do cliente: concessão entra
-- positiva, uso entra NEGATIVO com o lançamento que o consumiu.

alter table public.internal_credits
  add column if not exists transaction_id uuid
    references public.financial_transactions(id) on delete set null;

comment on column public.internal_credits.transaction_id is
  'Lançamento que gerou esta linha: o pagamento que consumiu o crédito (valor negativo) ou o estorno que o devolveu (positivo). Nulo na concessão manual.';

-- Um débito por lançamento: se o gatilho rodar duas vezes para o mesmo
-- pagamento, o segundo esbarra aqui em vez de descontar em dobro.
create unique index if not exists uniq_internal_credits_uso
  on public.internal_credits (transaction_id) where amount < 0;

create or replace function public.on_transaction_credit_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saldo numeric;
begin
  -- Só receita paga com crédito, e só na TRAVESSIA para pago.
  if new.payment_method is distinct from 'INTERNAL_CREDIT' then return new; end if;
  if not coalesce(new.is_paid, false) then return new; end if;
  if new.type <> 'INCOME' or new.category = 'Estorno' then return new; end if;
  if new.amount <= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.is_paid and old.payment_method is not distinct from 'INTERNAL_CREDIT' then
    return new;  -- já descontado quando virou pago
  end if;

  if new.client_id is null then
    raise exception 'Pagamento com crédito interno precisa de um cliente no lançamento.'
      using errcode = 'P0001';
  end if;

  -- Dois pagamentos simultâneos do mesmo cliente não podem ver o mesmo saldo.
  perform pg_advisory_xact_lock(hashtext('credito-interno:' || new.client_id::text));

  select coalesce(sum(c.amount), 0) into v_saldo
  from public.internal_credits c
  where c.client_id = new.client_id;

  if v_saldo < new.amount then
    raise exception 'Saldo de crédito interno insuficiente: o cliente tem R$ %.',
      replace(to_char(v_saldo, 'FM999999990.00'), '.', ',')
      using errcode = 'P0001';
  end if;

  insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
  values (new.client_id, new.branch_id, -new.amount, 'Pagamento: ' || new.description, new.id);

  return new;
end;
$$;

revoke execute on function public.on_transaction_credit_use() from public, anon, authenticated;

drop trigger if exists trg_credito_interno_uso on public.financial_transactions;
create trigger trg_credito_interno_uso
  after insert or update of is_paid, payment_method on public.financial_transactions
  for each row execute function public.on_transaction_credit_use();

-- ── O estorno de um pagamento feito com crédito DEVOLVE o crédito ────────────
-- Sem isto, estornar um atendimento pago com crédito tirava a receita e o
-- cliente perdia o saldo que gastou nele.
--
-- E um defeito achado junto: a contra-transação copiava `appointment_id`, mas
-- `financial_transactions` tem UNIQUE (appointment_id) — estornar o pagamento
-- de um ATENDIMENTO falhava sempre, com 23505. A contra-transação não leva o
-- agendamento; ela se liga à original pela descrição e pelo `notes`.

create or replace function public.estornar_transacao(p_transacao uuid, p_tenant uuid, p_ator text)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_tx      public.financial_transactions%rowtype;
  v_tenant  uuid;
  v_novo_id uuid;
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

  return v_novo_id;
end;
$function$;

revoke execute on function public.estornar_transacao(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.estornar_transacao(uuid, uuid, text) to service_role;
