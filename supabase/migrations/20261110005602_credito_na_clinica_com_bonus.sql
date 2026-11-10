-- A20 da 11ª simulação — o bônus no crédito na clínica, DECIDIDO pelo Heitor
-- (2026-11-10): "No estorno sai o bonus junto, a clinica decide se integral ou
-- parcial" (e "não vamos fazer as clinicas perderem dinheiro").
--
-- - A venda guarda o bônus (`creditos_vendidos.bonus`, zero por padrão).
-- - O caixa recebe só o pago: o lançamento continua sendo o valor pago (e os
--   pontos saem dele, pelo gatilho de sempre). O bônus entra no saldo da
--   cliente como CONCESSÃO ligada à venda (`internal_credits` com `concedido`
--   e o `credito_vendido_id`): sem dinheiro, não é receita.
-- - No estorno o bônus SAI junto, e a clínica escolhe como (`p_bonus`):
--   INTEIRO — o bônus sai todo (o que volta é o saldo menos o bônus, até o
--   pago) — ou PROPORCIONAL — sai na proporção do que volta (o saldo se
--   divide entre o pago e o bônus). Nunca volta mais do que ela pagou, e o que
--   sai do crédito nunca passa do saldo dela.
--
-- As funções novas têm um argumento a mais; as de antes viram invólucros
-- (o PostgREST escolhe pelo nome dos argumentos: sem ambiguidade).

alter table public.creditos_vendidos add column if not exists bonus numeric(12,2) not null default 0 check (bonus >= 0);
comment on column public.creditos_vendidos.bonus is
  'A20 da 11ª: o bônus da venda (concessão sem dinheiro, ligada à venda). O pago é o lançamento; o saldo da cliente recebe o pago + o bônus.';

create or replace function private.reais_no_texto(p numeric)
returns text language sql immutable set search_path to '' as $$
  select 'R$ ' || replace(replace(replace(to_char(round(coalesce(p, 0), 2), 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.')
$$;

create or replace function public.credito_vender(p_tenant uuid, p_cliente uuid, p_unidade uuid, p_valor numeric, p_metodo text, p_vezes integer, p_bandeira text, p_ator uuid, p_ator_nome text, p_bonus numeric)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_venda  uuid;
  v_metodo text := upper(trim(coalesce(p_metodo, '')));
  v_vezes  int  := coalesce(p_vezes, 1);
  v_valor  numeric := round(coalesce(p_valor, 0), 2);
  v_bonus  numeric := round(coalesce(p_bonus, 0), 2);
  v_ativa  boolean;
begin
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'P0001';
  end if;
  select c.is_active into v_ativa from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrada.' using errcode = 'P0001';
  end if;
  if v_ativa is false then
    raise exception 'A ficha desta cliente está arquivada: reative-a para vender.' using errcode = 'P0001';
  end if;
  if v_valor <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = 'P0001';
  end if;
  if v_bonus < 0 then
    raise exception 'O bônus não pode ser negativo.' using errcode = 'P0001';
  end if;
  if v_metodo not in ('PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD') then
    raise exception 'Escolha a forma de pagamento (Pix, dinheiro ou cartão): crédito na clínica não se paga com crédito.' using errcode = 'P0001';
  end if;
  if v_metodo <> 'CREDIT_CARD' then v_vezes := 1; end if;
  if v_vezes < 1 or v_vezes > 12 then
    raise exception 'Vezes no cartão inválidas.' using errcode = 'P0001';
  end if;

  insert into public.creditos_vendidos (tenant_id, branch_id, client_id, valor, bonus, registrado_por, registrado_por_nome)
  values (p_tenant, p_unidade, p_cliente, v_valor, v_bonus, p_ator, p_ator_nome)
  returning id into v_venda;

  -- O caixa recebe só o pago (os pontos saem dele, pelo gatilho).
  insert into public.financial_transactions (
    branch_id, client_id, type, category, description, amount,
    payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by, credito_vendido_id
  ) values (
    p_unidade, p_cliente, 'INCOME', 'Crédito na clínica', 'Crédito na clínica', v_valor,
    v_metodo::public."PaymentMethod",
    case when v_metodo = 'CREDIT_CARD' and v_vezes >= 2 then v_vezes end,
    private.bandeira_do_cartao(v_metodo, p_bandeira),
    true, now(), coalesce(p_ator::text, 'sistema'), v_venda
  );

  insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id, credito_vendido_id)
  values (p_cliente, p_unidade, v_valor,
          case when v_bonus > 0
               then 'Crédito na clínica comprado: ' || private.reais_no_texto(v_valor) || ' pagos + ' || private.reais_no_texto(v_bonus) || ' de bônus'
               else 'Crédito na clínica comprado' end,
          null, v_venda);

  -- O bônus: uma concessão (sem dinheiro) LIGADA à venda.
  if v_bonus > 0 then
    insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id, credito_vendido_id, concedido)
    values (p_cliente, p_unidade, v_bonus, 'Bônus da compra do crédito na clínica (sem dinheiro)', null, v_venda, true);
  end if;

  return v_venda;
end $function$;

create or replace function public.credito_vender(p_tenant uuid, p_cliente uuid, p_unidade uuid, p_valor numeric, p_metodo text, p_vezes integer, p_bandeira text, p_ator uuid, p_ator_nome text)
 returns uuid
 language sql
 security definer
 set search_path to ''
as $function$
  select public.credito_vender(p_tenant, p_cliente, p_unidade, p_valor, p_metodo, p_vezes, p_bandeira, p_ator, p_ator_nome, 0::numeric)
$function$;

create or replace function public.credito_estornar_venda(p_tenant uuid, p_venda uuid, p_ator uuid, p_ator_nome text, p_motivo text, p_esperado numeric, p_simular boolean, p_estorno text, p_novo jsonb, p_bonus text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_venda       public.creditos_vendidos%rowtype;
  v_tx          public.financial_transactions%rowtype;
  v_saldo       numeric;
  v_volta       numeric;
  v_fica        numeric;
  v_cartao      boolean;
  v_parcial     jsonb;
  v_resultado   jsonb;
  v_contra      uuid;
  v_ganho       public.loyalty_transactions%rowtype;
  v_pts         int;
  v_motivo      text := nullif(trim(coalesce(p_motivo, '')), '');
  v_estorno     text := nullif(upper(trim(coalesce(p_estorno, ''))), '');
  v_novo_metodo text := nullif(upper(trim(coalesce(p_novo ->> 'metodo', ''))), '');
  v_novo_vezes  int  := coalesce(nullif(p_novo ->> 'vezes', '')::int, 1);
  v_bonus       numeric;
  v_como        text := nullif(upper(trim(coalesce(p_bonus, ''))), '');
  v_bonus_sai   numeric := 0;
  v_saldo_pos   numeric;
  v_int_volta   numeric;
  v_int_bonus   numeric;
  v_pro_volta   numeric;
  v_pro_bonus   numeric;
begin
  select v.* into v_venda from public.creditos_vendidos v
   where v.id = p_venda and v.tenant_id = p_tenant
   for update;
  if not found then
    raise exception 'Venda de crédito não encontrada.' using errcode = 'P0001';
  end if;
  if v_venda.estornado_em is not null then
    raise exception 'Esta venda de crédito já foi estornada.' using errcode = 'P0001';
  end if;
  if v_como is not null and v_como not in ('INTEIRO', 'PROPORCIONAL') then
    raise exception 'Escolha como o bônus sai: inteiro ou na proporção do que volta.' using errcode = 'P0001';
  end if;

  -- O saldo da cliente sob a mesma trava do uso (on_transaction_credit_use).
  perform pg_advisory_xact_lock(hashtext('credito-interno:' || v_venda.client_id::text));
  select coalesce(sum(c.amount), 0) into v_saldo from public.internal_credits c where c.client_id = v_venda.client_id;

  select f.* into v_tx from public.financial_transactions f
   where f.credito_vendido_id = p_venda and f.type = 'INCOME' and f.is_paid
     and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno'
   order by f.created_at desc, f.id desc
   limit 1;
  if not found then
    raise exception 'O pagamento desta venda de crédito não foi encontrado.' using errcode = 'P0001';
  end if;

  v_bonus     := round(coalesce(v_venda.bonus, 0), 2);
  v_saldo_pos := greatest(v_saldo, 0);
  if v_bonus > 0 then
    -- INTEIRO: o bônus sai todo (até o saldo); volta o resto, até o pago.
    v_int_volta := round(least(v_tx.amount, greatest(v_saldo_pos - v_bonus, 0)), 2);
    v_int_bonus := round(least(v_bonus, v_saldo_pos), 2);
    -- PROPORCIONAL: o saldo se divide entre o pago e o bônus; o bônus sai na
    -- proporção do que volta (nunca o que sai passa do saldo).
    v_pro_volta := round(least(v_tx.amount, v_saldo_pos * v_tx.amount / (v_tx.amount + v_bonus)), 2);
    v_pro_bonus := round(least(v_bonus * v_pro_volta / v_tx.amount, greatest(v_saldo_pos - v_pro_volta, 0)), 2);
    if coalesce(v_como, 'INTEIRO') = 'INTEIRO' then
      v_volta := v_int_volta; v_bonus_sai := v_int_bonus;
    else
      v_volta := v_pro_volta; v_bonus_sai := v_pro_bonus;
    end if;
  else
    v_volta := round(least(v_tx.amount, v_saldo_pos), 2);
  end if;

  v_fica   := round(v_tx.amount - v_volta, 2);
  v_cartao := coalesce(v_tx.payment_method::text in ('CREDIT_CARD', 'DEBIT_CARD'), false);
  if v_volta > 0 and v_fica > 0 then
    v_parcial := jsonb_build_object(
      'id', v_tx.id, 'descricao', v_tx.description, 'metodo', v_tx.payment_method::text,
      'vezes', v_tx.cartao_vezes, 'bandeira', v_tx.cartao_bandeira, 'valor', v_tx.amount,
      'volta', v_volta, 'fica', v_fica, 'cartao', v_cartao);
  end if;
  v_resultado := jsonb_build_object(
    'vendido', v_venda.valor, 'pago', v_tx.amount, 'saldo', v_saldo, 'volta', v_volta, 'usado', v_fica,
    'parcial', v_parcial, 'metodo', v_tx.payment_method::text, 'vezes', v_tx.cartao_vezes,
    'bonus', v_bonus, 'bonus_sai', v_bonus_sai, 'bonus_como', case when v_bonus > 0 then v_como end,
    'opcoes_do_bonus', case when v_bonus > 0 then jsonb_build_object(
      'INTEIRO', jsonb_build_object('volta', v_int_volta, 'bonus_sai', v_int_bonus),
      'PROPORCIONAL', jsonb_build_object('volta', v_pro_volta, 'bonus_sai', v_pro_bonus)) end);
  if coalesce(p_simular, false) then
    return v_resultado;
  end if;

  if v_motivo is null then
    raise exception 'Diga o motivo do estorno.' using errcode = 'P0001';
  end if;
  if v_bonus > 0 and v_como is null then
    raise exception 'Esta venda teve bônus: escolha como o bônus sai — inteiro ou na proporção do que volta.' using errcode = 'P0001';
  end if;
  if v_volta <= 0 then
    raise exception 'O crédito desta venda já foi todo usado: não há o que devolver.' using errcode = 'P0001';
  end if;
  if p_esperado is not null and round(p_esperado, 2) <> v_volta then
    raise exception 'Os valores do crédito mudaram (a cliente usou ou recebeu crédito no meio): abra o estorno de novo.' using errcode = 'P0001';
  end if;

  -- Só por aqui o lançamento da venda do crédito se estorna (estornar_transacao confere).
  perform set_config('bellaris.estorno_do_credito', p_venda::text, true);

  if v_fica <= 0 then
    perform public.estornar_transacao(v_tx.id, p_tenant, coalesce(p_ator::text, 'sistema'), v_motivo);
  elsif v_cartao or v_estorno = 'INTEIRO' then
    if v_estorno is distinct from 'INTEIRO' then
      raise exception 'No cartão, a operadora estorna o pagamento inteiro: escolha estornar o pagamento inteiro e lançar o usado de novo.' using errcode = 'P0001';
    end if;
    if v_novo_metodo is null or v_novo_metodo not in ('PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD') then
      raise exception 'Escolha a forma do pagamento do usado.' using errcode = 'P0001';
    end if;
    perform public.estornar_transacao(v_tx.id, p_tenant, coalesce(p_ator::text, 'sistema'), v_motivo);
    insert into public.financial_transactions (
      branch_id, client_id, type, category, description, amount,
      payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by, credito_vendido_id
    ) values (
      v_tx.branch_id, v_tx.client_id, 'INCOME', v_tx.category,
      v_tx.description || ' — o usado, lançado de novo no estorno', v_fica,
      v_novo_metodo::public."PaymentMethod",
      case when v_novo_metodo = 'CREDIT_CARD' and v_novo_vezes >= 2 then v_novo_vezes end,
      private.bandeira_do_cartao(v_novo_metodo, p_novo ->> 'bandeira'),
      true, now(), coalesce(p_ator::text, 'sistema'), p_venda
    );
  else
    if v_estorno is distinct from 'PARCIAL' then
      raise exception 'Escolha como estornar: estorno parcial ou o pagamento inteiro com o usado lançado de novo.' using errcode = 'P0001';
    end if;
    -- Em parte: o lançamento fica com o usado, e o resto sai pelo
    -- contra-lançamento, na mesma forma (como no cancelamento do pacote).
    update public.financial_transactions set amount = v_fica, updated_at = now() where id = v_tx.id;
    insert into public.financial_transactions (
      branch_id, client_id, type, category, description, amount,
      payment_method, cartao_vezes, estorno_motivo, is_paid, paid_at, created_by
    ) values (
      v_tx.branch_id, v_tx.client_id, 'EXPENSE', 'Estorno', 'Estorno parcial: ' || v_tx.description, v_volta,
      v_tx.payment_method, v_tx.cartao_vezes, v_motivo, true, now(), coalesce(p_ator::text, 'sistema')
    ) returning id into v_contra;
    -- Os pontos daquele pagamento, na proporção do que voltou.
    select l.* into v_ganho from public.loyalty_transactions l where l.transaction_id = v_tx.id and l.kind = 'GANHO';
    if v_ganho.id is not null then
      perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_tx.client_id::text));
      v_pts := round(v_ganho.points * v_volta / v_tx.amount);
      if v_pts > 0 then
        insert into public.loyalty_transactions (
          loyalty_account_id, branch_id, kind, points, description,
          transaction_id, appointment_id, treatment_plan_id, expires_at, created_by
        ) values (
          v_ganho.loyalty_account_id, v_ganho.branch_id, 'ESTORNO_GANHO', -v_pts,
          'Estorno parcial: ' || v_tx.description, v_contra, null, null, v_ganho.expires_at, coalesce(p_ator::text, 'sistema')
        );
      end if;
    end if;
  end if;

  -- O saldo que voltou sai do crédito dela — e o bônus sai junto.
  insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id, credito_vendido_id)
  values (v_venda.client_id, v_venda.branch_id, -v_volta, 'Estorno da venda de crédito: ' || v_motivo, null, p_venda);
  if v_bonus_sai > 0 then
    insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id, credito_vendido_id, concedido)
    values (v_venda.client_id, v_venda.branch_id, -v_bonus_sai,
            case when v_como = 'PROPORCIONAL' then 'Bônus que saiu no estorno, na proporção do que voltou'
                 else 'Bônus que saiu no estorno, inteiro' end,
            null, p_venda, true);
  end if;

  update public.creditos_vendidos
     set estornado_em = now(), estornado_por = p_ator, estornado_por_nome = p_ator_nome,
         estorno_motivo = v_motivo, valor_devolvido = v_volta,
         estorno = v_resultado || jsonb_build_object('como', case when v_fica <= 0 then 'INTEIRO' else v_estorno end)
   where id = p_venda;

  return v_resultado;
end $function$;

create or replace function public.credito_estornar_venda(p_tenant uuid, p_venda uuid, p_ator uuid, p_ator_nome text, p_motivo text, p_esperado numeric, p_simular boolean, p_estorno text, p_novo jsonb)
 returns jsonb
 language sql
 security definer
 set search_path to ''
as $function$
  select public.credito_estornar_venda(p_tenant, p_venda, p_ator, p_ator_nome, p_motivo, p_esperado, p_simular, p_estorno, p_novo, null::text)
$function$;

revoke execute on function public.credito_vender(uuid, uuid, uuid, numeric, text, integer, text, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.credito_vender(uuid, uuid, uuid, numeric, text, integer, text, uuid, text, numeric) to service_role;
revoke execute on function public.credito_estornar_venda(uuid, uuid, uuid, text, text, numeric, boolean, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.credito_estornar_venda(uuid, uuid, uuid, text, text, numeric, boolean, text, jsonb, text) to service_role;
revoke execute on function private.reais_no_texto(numeric) from public, anon, authenticated;

notify pgrst, 'reload schema';
