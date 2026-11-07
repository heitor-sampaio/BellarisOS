-- Decisão 1 do Heitor sobre a 9ª simulação (2026-11-07, "concordo"): VENDER
-- crédito na clínica em dinheiro — o "vale".
--
-- A Rosana pagou R$ 300 no Pix para usar depois em qualquer coisa. Só existia o
-- "Conceder crédito" (crédito interno fora do caixa, para o crédito de fora e a
-- sobra de cancelamento), e os R$ 300 não entraram no caixa, no fechamento nem
-- no faturamento. A regra:
--   - "Crédito na clínica" no Vender, para quem recebe, com a forma de pagamento;
--   - entra no caixa, no fechamento e no faturamento no dia em que o dinheiro
--     entrou (princípio 5): é um lançamento de receita PAGO, e a regra única de
--     receita (`metrics_receitas_pagas`) o conta sem mudar nada;
--   - o uso depois segue a regra de hoje: pagar com crédito interno não é
--     receita de novo (F7) nem pontua (o gatilho da fidelidade já pula);
--   - os pontos saem na VENDA, pelo dinheiro pago — também no modo "por
--     procedimento", que o crédito não tem procedimento (como o produto);
--   - sem comissão de venda (nenhuma linha nasce);
--   - estornável como as outras vendas: volta o que ela ainda NÃO usou do
--     saldo (até o vendido); o usado fica pago. No cartão, o pagamento inteiro
--     volta e o usado é lançado de novo (r2-fin-03).
-- O "Conceder crédito" continua como está.

-- 1. A venda do crédito. Só o servidor lê e grava (RLS sem política
--    permissiva). Chave estrangeira só para a rede e a cliente: a tabela não
--    vira "junção" no PostgREST (PGRST201).
create table if not exists public.creditos_vendidos (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id),
  branch_id          uuid not null,
  client_id          uuid not null references public.clients(id),
  valor              numeric not null check (valor > 0),
  registrado_por     uuid,
  registrado_por_nome text,
  created_at         timestamptz not null default now(),
  estornado_em       timestamptz,
  estornado_por      uuid,
  estornado_por_nome text,
  estorno_motivo     text,
  valor_devolvido    numeric not null default 0,
  estorno            jsonb
);
create index if not exists creditos_vendidos_cliente on public.creditos_vendidos (client_id);
create index if not exists creditos_vendidos_rede_dia on public.creditos_vendidos (tenant_id, created_at);

comment on table public.creditos_vendidos is
  'Crédito na clínica VENDIDO em dinheiro (decisão 1 do Heitor sobre a 9ª simulação): o lançamento pago e o crédito interno levam credito_vendido_id.';

alter table public.creditos_vendidos enable row level security;
create policy suporte_sem_escrita_ins on public.creditos_vendidos as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.creditos_vendidos as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end) with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.creditos_vendidos as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- 2. O dinheiro e o saldo ligados à venda (sem chave estrangeira, de propósito).
alter table public.financial_transactions add column if not exists credito_vendido_id uuid;
alter table public.internal_credits       add column if not exists credito_vendido_id uuid;
create index if not exists financial_transactions_credito_vendido on public.financial_transactions (credito_vendido_id) where credito_vendido_id is not null;

-- 3. Vender: a venda, o lançamento PAGO e o crédito, numa transação.
create or replace function public.credito_vender(
  p_tenant uuid, p_cliente uuid, p_unidade uuid, p_valor numeric,
  p_metodo text, p_vezes int, p_bandeira text, p_ator uuid, p_ator_nome text
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_venda  uuid;
  v_metodo text := upper(trim(coalesce(p_metodo, '')));
  v_vezes  int  := coalesce(p_vezes, 1);
  v_valor  numeric := round(coalesce(p_valor, 0), 2);
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
  if v_metodo not in ('PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD') then
    raise exception 'Escolha a forma de pagamento (Pix, dinheiro ou cartão): crédito na clínica não se paga com crédito.' using errcode = 'P0001';
  end if;
  if v_metodo <> 'CREDIT_CARD' then v_vezes := 1; end if;
  if v_vezes < 1 or v_vezes > 12 then
    raise exception 'Vezes no cartão inválidas.' using errcode = 'P0001';
  end if;

  insert into public.creditos_vendidos (tenant_id, branch_id, client_id, valor, registrado_por, registrado_por_nome)
  values (p_tenant, p_unidade, p_cliente, v_valor, p_ator, p_ator_nome)
  returning id into v_venda;

  insert into public.financial_transactions (
    branch_id, client_id, type, category, description, amount,
    payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by, credito_vendido_id
  ) values (
    p_unidade, p_cliente, 'INCOME', 'Crédito na clínica', 'Crédito na clínica', v_valor,
    v_metodo::public."PaymentMethod",
    case when v_metodo = 'CREDIT_CARD' and v_vezes >= 2 then v_vezes end,
    private.bandeira_do_cartao(v_metodo, p_bandeira),
    true, now(), p_ator::text, v_venda
  );

  insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id, credito_vendido_id)
  values (p_cliente, p_unidade, v_valor, 'Crédito na clínica comprado', null, v_venda);

  return v_venda;
end $$;

-- 4. Estornar a venda do crédito: volta o que ela ainda NÃO usou (o saldo
--    dela hoje, até o vendido); o usado fica pago. Com `p_simular`, só a conta
--    (a janela a mostra, e confirmar manda o "volta" que ela viu).
create or replace function public.credito_estornar_venda(
  p_tenant uuid, p_venda uuid, p_ator uuid, p_ator_nome text, p_motivo text,
  p_esperado numeric, p_simular boolean, p_estorno text, p_novo jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
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

  v_volta  := round(least(v_tx.amount, greatest(v_saldo, 0)), 2);
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
    'parcial', v_parcial, 'metodo', v_tx.payment_method::text, 'vezes', v_tx.cartao_vezes);
  if coalesce(p_simular, false) then
    return v_resultado;
  end if;

  if v_motivo is null then
    raise exception 'Diga o motivo do estorno.' using errcode = 'P0001';
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
    perform public.estornar_transacao(v_tx.id, p_tenant, p_ator::text, v_motivo);
  elsif v_cartao or v_estorno = 'INTEIRO' then
    if v_estorno is distinct from 'INTEIRO' then
      raise exception 'No cartão, a operadora estorna o pagamento inteiro: escolha estornar o pagamento inteiro e lançar o usado de novo.' using errcode = 'P0001';
    end if;
    if v_novo_metodo is null or v_novo_metodo not in ('PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD') then
      raise exception 'Escolha a forma do pagamento do usado.' using errcode = 'P0001';
    end if;
    perform public.estornar_transacao(v_tx.id, p_tenant, p_ator::text, v_motivo);
    insert into public.financial_transactions (
      branch_id, client_id, type, category, description, amount,
      payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by, credito_vendido_id
    ) values (
      v_tx.branch_id, v_tx.client_id, 'INCOME', v_tx.category,
      v_tx.description || ' — o usado, lançado de novo no estorno', v_fica,
      v_novo_metodo::public."PaymentMethod",
      case when v_novo_metodo = 'CREDIT_CARD' and v_novo_vezes >= 2 then v_novo_vezes end,
      private.bandeira_do_cartao(v_novo_metodo, p_novo ->> 'bandeira'),
      true, now(), p_ator::text, p_venda
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
      v_tx.payment_method, v_tx.cartao_vezes, v_motivo, true, now(), p_ator::text
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

  -- O saldo que voltou sai do crédito dela.
  insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id, credito_vendido_id)
  values (v_venda.client_id, v_venda.branch_id, -v_volta, 'Estorno da venda de crédito: ' || v_motivo, null, p_venda);

  update public.creditos_vendidos
     set estornado_em = now(), estornado_por = p_ator, estornado_por_nome = p_ator_nome,
         estorno_motivo = v_motivo, valor_devolvido = v_volta,
         estorno = v_resultado || jsonb_build_object('como', case when v_fica <= 0 then 'INTEIRO' else v_estorno end)
   where id = p_venda;

  return v_resultado;
end $$;

-- 5. Os pontos da venda do crédito: pelo dinheiro pago, em qualquer modo (a
--    decisão: "os pontos na VENDA do crédito, pelo dinheiro pago"). O resto da
--    função é o corpo da produção (2026-11-07).
create or replace function public.fidelidade_pontos_do_pagamento(p_tx financial_transactions, p_cfg loyalty_configs)
 returns integer
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_total     numeric;
  v_pago      numeric;
  v_ja        int;
  v_plano_pts numeric;
  v_alvo      int;
begin
  -- O crédito na clínica VENDIDO (decisão 1 da 9ª): pelo dinheiro pago, também
  -- no modo "por procedimento" — o uso depois, pago com crédito, não pontua.
  if p_tx.credito_vendido_id is not null then
    return floor(p_tx.amount * p_cfg.points_per_real)::int;
  end if;

  -- A venda de produto (D4): só pontua se a clínica ligou, e por real pago.
  if p_tx.product_sale_id is not null then
    if not coalesce(p_cfg.pontua_venda_de_produto, false) then
      return 0;
    end if;
    return floor(p_tx.amount * p_cfg.points_per_real)::int;
  end if;

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

  if p_tx.treatment_plan_id is not null then
    select coalesce(sum(p.price), 0)
      into v_total
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = p_tx.treatment_plan_id;

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
      select coalesce(sum(coalesce(pr.loyalty_points, 0)), 0)
        into v_plano_pts
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
        join public.procedures pr on pr.id = p.procedure_id
       where s.plan_id = p_tx.treatment_plan_id;
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
$function$;

-- 6. O lançamento da venda do crédito só se estorna como VENDA (sozinho, o
--    dinheiro voltava e o crédito ficava com a cliente). O resto é o corpo da
--    produção (2026-11-07).
create or replace function public.estornar_transacao(p_transacao uuid, p_tenant uuid, p_ator text, p_motivo text default null::text)
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

  -- O lançamento de uma venda de produto só se estorna com a VENDA
  -- (produto_estornar_venda, que diz se o produto voltou): sozinho, o
  -- dinheiro voltava e a venda seguia nas Vendas, no custo e fora do estoque.
  if v_tx.product_sale_id is not null
     and coalesce(current_setting('bellaris.estorno_da_venda', true), '') <> v_tx.product_sale_id::text then
    raise exception 'Este lançamento é de uma venda de produto: estorne a venda, dizendo se o produto voltou ao estoque.' using errcode = 'P0001';
  end if;

  -- O da venda de CRÉDITO NA CLÍNICA (decisão 1 da 9ª) também: sozinho, o
  -- dinheiro voltava e o crédito ficava com a cliente.
  if v_tx.credito_vendido_id is not null
     and coalesce(current_setting('bellaris.estorno_do_credito', true), '') <> v_tx.credito_vendido_id::text then
    raise exception 'Este lançamento é de uma venda de crédito na clínica: estorne a venda — volta o saldo que a cliente ainda não usou.' using errcode = 'P0001';
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
    payment_method, cartao_vezes, cartao_bandeira, estorno_motivo,
    is_paid, paid_at, created_by
  ) values (
    v_tx.branch_id, v_tx.client_id, null, v_tx.treatment_plan_id,
    case when v_tx.type = 'INCOME' then 'EXPENSE' else 'INCOME' end::public."TransactionType",
    'Estorno',
    'Estorno: ' || v_tx.description,
    v_tx.amount,
    v_tx.payment_method, v_tx.cartao_vezes, v_tx.cartao_bandeira, v_motivo,
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

-- Endpoints do servidor: a rede vem por parâmetro.
revoke execute on function public.credito_vender(uuid, uuid, uuid, numeric, text, int, text, uuid, text) from public, anon, authenticated;
grant execute on function public.credito_vender(uuid, uuid, uuid, numeric, text, int, text, uuid, text) to service_role;
revoke execute on function public.credito_estornar_venda(uuid, uuid, uuid, text, text, numeric, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.credito_estornar_venda(uuid, uuid, uuid, text, text, numeric, boolean, text, jsonb) to service_role;

notify pgrst, 'reload schema';
