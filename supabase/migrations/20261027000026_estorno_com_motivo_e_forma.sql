-- O estorno guarda o MOTIVO, e o contra-lançamento sai na forma da original
-- (A36 da simulação de 2026-10-27, decisão do Heitor).
--
-- O estorno não perguntava por quê, e a linha do estorno ficava sem forma de
-- pagamento: quem confere a gaveta não sabia que os R$ 50 estornados saíram do
-- dinheiro em espécie. Agora:
-- - `financial_transactions.estorno_motivo`, gravado na original E no
--   contra-lançamento (a lista mostra nas duas linhas);
-- - o contra-lançamento herda `payment_method` e `cartao_vezes` da original.
--   Ele continua fora de toda conta (categoria 'Estorno', dos dois lados) e
--   de todo gatilho de dinheiro (crédito interno, fidelidade, comissão e
--   pagamento ignoram 'Estorno');
-- - o motivo é obrigatório na tela e na action (`reverseTransaction`); a
--   função aceita sem ele para os chamadores de antes (o estorno do
--   fechamento de comissões passa o dele).

alter table public.financial_transactions add column if not exists estorno_motivo text;
comment on column public.financial_transactions.estorno_motivo is
  'Por que foi estornado — na original (notes = ''Estornada'') e no contra-lançamento (categoria ''Estorno'').';

drop function if exists public.estornar_transacao(uuid, uuid, text);
create function public.estornar_transacao(p_transacao uuid, p_tenant uuid, p_ator text, p_motivo text default null)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  v_tx      public.financial_transactions%rowtype;
  v_tenant  uuid;
  v_novo_id uuid;
  v_ganho   public.loyalty_transactions%rowtype;
  v_resgate public.loyalty_transactions%rowtype;
  v_meses   int;
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
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
    payment_method, cartao_vezes, estorno_motivo,
    is_paid, paid_at, created_by
  ) values (
    v_tx.branch_id, v_tx.client_id, null, v_tx.treatment_plan_id,
    case when v_tx.type = 'INCOME' then 'EXPENSE' else 'INCOME' end::public."TransactionType",
    'Estorno',
    'Estorno: ' || v_tx.description,
    v_tx.amount,
    v_tx.payment_method, v_tx.cartao_vezes, v_motivo,
    true, now(), p_ator
  )
  returning id into v_novo_id;

  update public.financial_transactions
     set notes = 'Estornada', estorno_motivo = v_motivo, updated_at = now()
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
$function$;

revoke all on function public.estornar_transacao(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.estornar_transacao(uuid, uuid, text, text) to service_role;

-- O estorno do fechamento de comissões passa o motivo dele.
create or replace function public.comissao_estornar_fechamento(p_tenant uuid, p_fechamento uuid, p_ator uuid, p_motivo text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_p      public.commission_payouts%rowtype;
  v_contra uuid;
begin
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Diga o motivo do estorno.' using errcode = 'P0001';
  end if;
  select * into v_p from public.commission_payouts p where p.id = p_fechamento for update;
  if not found or v_p.tenant_id is distinct from p_tenant then
    raise exception 'Fechamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_p.estornado_at is not null then
    raise exception 'Este fechamento já foi estornado.' using errcode = 'P0001';
  end if;

  perform set_config('app.estorno_de_fechamento', 'on', true);
  v_contra := public.estornar_transacao(v_p.transaction_id, p_tenant, coalesce(p_ator::text, 'sistema'), trim(p_motivo));
  perform set_config('app.estorno_de_fechamento', 'off', true);

  update public.commissions c
     set status = 'OPEN', paid_at = null, paid_by = null, payout_id = null
   where c.payout_id = p_fechamento;

  update public.commission_payouts
     set estornado_at = now(), estornado_por = p_ator, estorno_motivo = trim(p_motivo), estorno_transaction_id = v_contra
   where id = p_fechamento;

  return v_contra;
end $function$;

notify pgrst, 'reload schema';
