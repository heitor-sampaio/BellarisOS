-- F20 (6ª simulação, 2026-11-04) — D1: cancelar a unidade do pré-pago vai
-- pelo fluxo do PACOTE.
--
-- O Jorge pagou 3 peelings (R$ 750) no Visa 2x, e a Sofia cancelou a unidade
-- 2. A tela dizia "Devolução de R$ 250,00 registrada no financeiro"; no banco
-- era uma DESPESA PENDENTE sem forma (o "A pagar" subia R$ 250), os
-- recebíveis da operadora seguiam 375 + 375 e os pontos não mudavam. Era a
-- regra de 30/09 ("registra para fazer estorno"), de antes das decisões do
-- pacote: F2b (a clínica escolhe estorno ou crédito — princípio 1) e F13 (no
-- cartão, a operadora estorna o pagamento inteiro).
--
-- `procedimento_cancelar_unidade_devolvendo` é a conta do pacote
-- (`pacote_cancelar_devolvendo`) para a unidade: a venda passa a valer o
-- vendido menos as unidades canceladas; o a receber que passa disso cai
-- antes (a parcela inteira sai `Estornada`, a que cai em parte diminui); o
-- pago além disso volta como ESTORNO (o de sempre; o pagamento pego em parte,
-- parcial ou inteiro com o que fica lançado de novo — no cartão só o
-- inteiro, e os recebíveis da operadora caem pelo gatilho) ou como CRÉDITO NA
-- CLÍNICA. Os pontos seguem o estorno; a comissão das unidades usadas se
-- acerta. Com `p_simular`, devolve a conta para a janela, sem gravar.
--
-- A devolução PENDENTE que a versão de antes gravou (a do Jorge, R$ 250, dado
-- de [sim]) não é tocada: ela continua descontando do que volta, como antes.

alter table public.procedure_sale_units add column if not exists cancelamento jsonb;
comment on column public.procedure_sale_units.cancelamento is
  'D1 (F20): o retrato da conta do cancelamento da unidade (o que caiu, o que voltou e como).';

create or replace function public.procedimento_cancelar_unidade_devolvendo(
  p_tenant uuid, p_unidade uuid, p_ator uuid, p_ator_nome text, p_motivo text,
  p_destino text, p_esperado numeric, p_simular boolean, p_estorno text, p_novo jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_u           public.procedure_sale_units%rowtype;
  v_venda       public.procedure_sales%rowtype;
  v_ag_status   text;
  v_nome        text;
  v_motivo      text := nullif(trim(coalesce(p_motivo, '')), '');
  v_ator        text := coalesce(p_ator::text, 'sistema');
  v_valor       numeric;
  v_pago        numeric;
  v_aberto      numeric;
  v_devolvido   numeric;
  v_cortar      numeric;
  v_cortado     numeric := 0;
  v_devolver    numeric;
  v_resto       numeric;
  v_corte       numeric;
  v_parcelas    jsonb := '[]'::jsonb;
  v_tx          record;
  v_contra      uuid;
  v_ganho       public.loyalty_transactions%rowtype;
  v_pts         int;
  v_linha       uuid;
  v_fid         boolean;
  v_destino     text := nullif(upper(trim(coalesce(p_destino, ''))), '');
  v_resultado   jsonb;
  v_parcial     jsonb;
  v_estorno     text := nullif(upper(trim(coalesce(p_estorno, ''))), '');
  v_novo_metodo text := nullif(upper(trim(coalesce(p_novo ->> 'metodo', ''))), '');
  v_novo_vezes  int  := coalesce(nullif(p_novo ->> 'vezes', '')::int, 1);
  v_fica        numeric;
begin
  if p_simular then
    select * into v_u from public.procedure_sale_units u where u.id = p_unidade;
  else
    select * into v_u from public.procedure_sale_units u where u.id = p_unidade for update;
  end if;
  if not found then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  if p_simular then
    select * into v_venda from public.procedure_sales s where s.id = v_u.sale_id;
  else
    select * into v_venda from public.procedure_sales s where s.id = v_u.sale_id for update;
  end if;
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
  select p.name into v_nome from public.procedures p where p.id = v_venda.procedure_id;

  -- O que a venda passa a valer: o vendido menos as unidades canceladas e esta.
  select round(v_venda.price - coalesce(sum(u.preco) filter (where u.status = 'CANCELADA'), 0) - v_u.preco, 2)
    into v_valor
    from public.procedure_sale_units u where u.sale_id = v_venda.id;
  v_valor := greatest(v_valor, 0);

  -- O dinheiro da venda, vivo (sem o estornado nem o estorno).
  select coalesce(sum(f.amount) filter (where f.is_paid), 0),
         coalesce(sum(f.amount) filter (where not f.is_paid), 0)
    into v_pago, v_aberto
    from public.financial_transactions f
   where f.procedure_sale_id = v_venda.id and f.type = 'INCOME'
     and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno';
  -- A devolução que a versão de antes registrou (despesa "Devolução") já conta.
  select coalesce(sum(f.amount), 0) into v_devolvido
    from public.financial_transactions f
   where f.procedure_sale_id = v_venda.id and f.type = 'EXPENSE' and f.category = 'Devolução'
     and coalesce(f.notes, '') <> 'Estornada';
  v_cortar   := least(v_aberto, greatest(0, round(v_pago + v_aberto - v_valor, 2)));
  v_devolver := greatest(0, round(v_pago - v_valor - v_devolvido, 2));

  select coalesce(c.enabled, false) into v_fid from public.loyalty_configs c where c.tenant_id = p_tenant;

  -- As parcelas que caem (a conta, também para a tela): o mais novo primeiro.
  v_resto := v_cortar;
  for v_tx in
    select f.id, f.amount, f.description, f.due_date
      from public.financial_transactions f
     where f.procedure_sale_id = v_venda.id and f.type = 'INCOME' and not f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
     order by f.due_date desc nulls first, f.parcela_numero desc nulls last, f.created_at desc, f.id desc
  loop
    exit when v_resto <= 0;
    v_corte := least(v_resto, v_tx.amount);
    v_parcelas := v_parcelas || jsonb_build_object('id', v_tx.id, 'descricao', v_tx.description, 'vencimento', v_tx.due_date,
                                                   'valor', v_tx.amount, 'cai', v_corte, 'fica', v_tx.amount - v_corte);
    v_resto := v_resto - v_corte;
  end loop;

  -- O pagamento que o estorno pega EM PARTE, se houver (pede a escolha; no
  -- cartão, só o inteiro).
  if v_devolver > 0 then
    v_resto := v_devolver;
    for v_tx in
      select f.id, f.amount, f.description, f.payment_method, f.cartao_vezes
        from public.financial_transactions f
       where f.procedure_sale_id = v_venda.id and f.type = 'INCOME' and f.is_paid
         and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
       order by coalesce(f.paid_at, f.created_at) desc, f.created_at desc, f.id desc
    loop
      exit when v_resto <= 0;
      if v_tx.amount <= v_resto then
        v_resto := round(v_resto - v_tx.amount, 2);
      else
        v_parcial := jsonb_build_object(
          'id', v_tx.id, 'descricao', v_tx.description, 'metodo', v_tx.payment_method::text,
          'vezes', v_tx.cartao_vezes, 'valor', v_tx.amount, 'volta', v_resto,
          'fica', round(v_tx.amount - v_resto, 2),
          'cartao', coalesce(v_tx.payment_method::text in ('CREDIT_CARD', 'DEBIT_CARD'), false));
        v_resto := 0;
      end if;
    end loop;
  end if;

  v_resultado := jsonb_build_object(
    'procedimento', coalesce(v_nome, 'Procedimento'), 'unidade', v_u.numero, 'preco_unidade', v_u.preco,
    'quantidade', v_venda.quantity, 'vendido', v_venda.price, 'valor_novo', v_valor,
    'pago', v_pago, 'a_receber', v_aberto, 'parcelas', v_parcelas, 'cai', v_cortar,
    'devolvido_antes', v_devolvido, 'devolver', v_devolver,
    'fidelidade', coalesce(v_fid, false), 'parcial', v_parcial);

  if p_simular then
    return v_resultado;
  end if;

  -- Daqui em diante, grava. As escolhas que a tela tem de ter feito:
  if v_motivo is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  if round(coalesce(p_esperado, -1), 2) <> v_devolver then
    raise exception 'Os valores da venda mudaram desde que a janela abriu: feche e abra de novo.' using errcode = 'P0001';
  end if;
  if v_devolver > 0 and v_destino is distinct from 'ESTORNO' and v_destino is distinct from 'CREDITO' then
    raise exception 'Diga como devolver o que a cliente pagou além do que a venda vale: estorno ou crédito na clínica.' using errcode = 'P0001';
  end if;
  if v_destino = 'ESTORNO' and v_parcial is not null then
    if v_estorno is null and not (v_parcial ->> 'cartao')::boolean then
      v_estorno := 'PARCIAL';   -- o chamador de antes, fora do cartão
    end if;
    if (v_parcial ->> 'cartao')::boolean and v_estorno is distinct from 'INTEIRO' then
      raise exception 'No cartão, o estorno é do pagamento inteiro: estorne o pagamento inteiro e lance o usado de novo.' using errcode = 'P0001';
    end if;
    if v_estorno is distinct from 'PARCIAL' and v_estorno is distinct from 'INTEIRO' then
      raise exception 'Diga como estornar o pagamento: estorno parcial ou o pagamento inteiro com o usado lançado de novo.' using errcode = 'P0001';
    end if;
    if v_estorno = 'INTEIRO' then
      if v_novo_metodo is null or v_novo_metodo not in ('CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD') then
        raise exception 'Diga a forma do pagamento do usado.' using errcode = 'P0001';
      end if;
      if v_novo_vezes < 1 or v_novo_vezes > 12 or (v_novo_metodo <> 'CREDIT_CARD' and v_novo_vezes <> 1) then
        raise exception 'As vezes no cartão vão de 1 a 12, só no crédito.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- 1. A unidade, com o retrato da conta.
  update public.procedure_sale_units
     set status = 'CANCELADA', cancelled_at = now(), cancelled_by = p_ator,
         cancel_reason = v_motivo, appointment_id = null,
         cancelamento = v_resultado || jsonb_build_object(
           'destino', case when v_devolver > 0 then v_destino end,
           'estorno', case when v_destino = 'ESTORNO' and v_parcial is not null then v_estorno end,
           'novo', case when v_estorno = 'INTEIRO' then jsonb_build_object('metodo', v_novo_metodo, 'vezes', v_novo_vezes) end,
           'por', p_ator_nome)
   where id = v_u.id;

  -- 2. O crediário que passa do novo valor cai.
  for v_tx in
    select f.id, f.amount
      from public.financial_transactions f
     where f.procedure_sale_id = v_venda.id and f.type = 'INCOME' and not f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
     order by f.due_date desc nulls first, f.parcela_numero desc nulls last, f.created_at desc, f.id desc
     for update
  loop
    exit when v_cortado >= v_cortar;
    v_corte := least(v_cortar - v_cortado, v_tx.amount);
    if v_corte >= v_tx.amount then
      update public.financial_transactions
         set notes = 'Estornada', estorno_motivo = 'Unidade cancelada: ' || v_motivo, updated_at = now()
       where id = v_tx.id;
    else
      update public.financial_transactions set amount = amount - v_corte, updated_at = now() where id = v_tx.id;
    end if;
    v_cortado := v_cortado + v_corte;
  end loop;

  -- 3. O pago além do novo valor volta.
  if v_devolver > 0 and v_destino = 'CREDITO' then
    insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
    values (v_venda.client_id, v_venda.branch_id, v_devolver,
            'Cancelamento da unidade ' || v_u.numero || ' de ' || coalesce(v_nome, 'procedimento pré-pago'), null);
  elsif v_devolver > 0 then
    v_resto := v_devolver;
    for v_tx in
      select f.*
        from public.financial_transactions f
       where f.procedure_sale_id = v_venda.id and f.type = 'INCOME' and f.is_paid
         and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
       order by coalesce(f.paid_at, f.created_at) desc, f.created_at desc, f.id desc
       for update
    loop
      exit when v_resto <= 0;
      if v_tx.amount <= v_resto then
        perform public.estornar_transacao(v_tx.id, p_tenant, v_ator, v_motivo);
        v_resto := round(v_resto - v_tx.amount, 2);
      elsif v_estorno = 'INTEIRO' then
        -- O pagamento inteiro estornado (no cartão, os recebíveis da operadora
        -- caem pelo gatilho) e o que fica lançado de novo, pago agora.
        v_fica := round(v_tx.amount - v_resto, 2);
        perform public.estornar_transacao(v_tx.id, p_tenant, v_ator, v_motivo);
        insert into public.financial_transactions (
          branch_id, client_id, procedure_sale_id, type, category, description, amount,
          payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by
        ) values (
          v_tx.branch_id, v_tx.client_id, v_venda.id, 'INCOME', v_tx.category,
          v_tx.description || ' — o que fica, lançado de novo no cancelamento da unidade ' || v_u.numero, v_fica,
          v_novo_metodo::public."PaymentMethod",
          case when v_novo_metodo = 'CREDIT_CARD' and v_novo_vezes >= 2 then v_novo_vezes end,
          private.bandeira_do_cartao(v_novo_metodo, p_novo ->> 'bandeira'),
          true, now(), v_ator
        );
        v_resto := 0;
      else
        -- Em parte: o lançamento fica com o que vale, e o resto sai pelo
        -- contra-lançamento, na mesma forma.
        update public.financial_transactions
           set amount = round(amount - v_resto, 2), updated_at = now()
         where id = v_tx.id;
        insert into public.financial_transactions (
          branch_id, client_id, appointment_id, treatment_plan_id,
          type, category, description, amount,
          payment_method, cartao_vezes, estorno_motivo,
          is_paid, paid_at, created_by
        ) values (
          v_tx.branch_id, v_tx.client_id, null, null,
          'EXPENSE', 'Estorno', 'Estorno parcial: ' || v_tx.description, v_resto,
          v_tx.payment_method, v_tx.cartao_vezes, v_motivo,
          true, now(), v_ator
        ) returning id into v_contra;
        if v_tx.payment_method = 'INTERNAL_CREDIT' and v_tx.client_id is not null then
          insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
          values (v_tx.client_id, v_tx.branch_id, v_resto, 'Estorno parcial: ' || v_tx.description, v_contra);
        end if;
        if v_tx.client_id is not null then
          select l.* into v_ganho from public.loyalty_transactions l
           where l.transaction_id = v_tx.id and l.kind = 'GANHO';
          if v_ganho.id is not null then
            perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_tx.client_id::text));
            v_pts := round(v_ganho.points * v_resto / v_tx.amount);
            if v_pts > 0 then
              insert into public.loyalty_transactions (
                loyalty_account_id, branch_id, kind, points, description,
                transaction_id, appointment_id, treatment_plan_id, expires_at, created_by
              ) values (
                v_ganho.loyalty_account_id, v_ganho.branch_id, 'ESTORNO_GANHO', -v_pts,
                'Estorno parcial: ' || v_tx.description,
                v_contra, v_ganho.appointment_id, v_ganho.treatment_plan_id, v_ganho.expires_at, v_ator
              );
            end if;
          end if;
        end if;
        v_resto := 0;
      end if;
    end loop;
  end if;

  -- 4. A comissão das unidades usadas, com a venda que ficou (idempotente).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.procedure_sale_id = v_venda.id and cl.status <> 'CANCELADA'
     order by cl.created_at
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento de unidade do pré-pago', null);
  end loop;

  return v_resultado || jsonb_build_object(
    'destino', case when v_devolver > 0 then v_destino end,
    'estorno', case when v_destino = 'ESTORNO' and v_parcial is not null then v_estorno end,
    'reduzido', v_cortado);
end $function$;

revoke execute on function public.procedimento_cancelar_unidade_devolvendo(uuid, uuid, uuid, text, text, text, numeric, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.procedimento_cancelar_unidade_devolvendo(uuid, uuid, uuid, text, text, text, numeric, boolean, text, jsonb) to service_role;

-- A de antes vira um invólucro da nova, sem a escolha (como pacote_cancelar):
-- o que volta vai por estorno (fora do cartão, o parcial; no cartão, recusa).
create or replace function public.procedimento_cancelar_unidade(p_tenant uuid, p_unidade uuid, p_ator uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_previa jsonb;
  v_r      jsonb;
begin
  v_previa := public.procedimento_cancelar_unidade_devolvendo(
    p_tenant, p_unidade, p_ator, null, p_motivo, null, null, true, null, null);
  v_r := public.procedimento_cancelar_unidade_devolvendo(
    p_tenant, p_unidade, p_ator, null, p_motivo, 'ESTORNO', (v_previa ->> 'devolver')::numeric, false, null, null);
  return jsonb_build_object('devolver', (v_r ->> 'devolver')::numeric, 'reduzido', (v_r ->> 'reduzido')::numeric);
end $function$;

notify pgrst, 'reload schema';
