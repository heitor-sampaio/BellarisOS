-- D4 da 9ª simulação: CANCELAR O PLANO FECHADO, com a mesma regra e o mesmo
-- núcleo do "Cancelar pacote" (decisão 2 do Heitor, 2026-11-07: "sim usa a
-- mesma coisa do pacote, como ja expliquei, a diferenca entre pacote e plano é
-- que o plano é personalizado para o cliente conforme a necessidade dele e o
-- pacote é uma oferta de um conjunto de procedimentos montado previsamente, os
-- dois são, em essencia, conjuntos de procedimentos").
--
-- 1. O plano guarda o retrato do cancelamento, como o pacote: quando, quem, o
--    motivo, o valor que caiu (as sessões que sobraram) e a conta inteira.
--    `cancelado_por` SEM chave estrangeira: o plano já aponta para `users`
--    (professional_id), e uma segunda chave deixaria ambíguo o embed
--    treatment_plans → users que as telas fazem.
-- 2. O DINHEIRO do cancelamento sai de `pacote_cancelar_devolvendo` para um
--    núcleo só, `private.cancelamento_dinheiro`: o crediário que passa do usado
--    cai antes (do mais novo para o mais antigo; a parcela inteira sai
--    `Estornada`, a pega em parte diminui), e o pago além do usado volta como
--    CRÉDITO na clínica ou ESTORNO — o lançamento inteiro pelo estorno de
--    sempre; o pego em parte, estorno parcial ou o pagamento inteiro estornado
--    e o usado lançado de novo (r2-ven-05; no cartão, só o inteiro — r2-fin-03).
--    O pacote passa a chamá-lo (a conta e a ordem são as de antes) e o plano
--    também. A prévia do pagamento pego em parte leva a BANDEIRA dele (A41 da
--    8ª: a forma do usado vem com a original).
-- 3. `plano_cancelar_devolvendo`: a mesma assinatura e a mesma resposta de
--    `pacote_cancelar_devolvendo`. O usado é a soma das sessões FEITAS (o
--    agendamento concluído), cada uma pelo preço dos procedimentos dela no
--    plano (com o desconto já rateado) — sem multa nem tabela. As agendadas se
--    cancelam ou ficam avulsas com o preço da sessão; o plano fica CANCELLED.

alter table public.treatment_plans
  add column if not exists cancelado_em        timestamptz,
  add column if not exists cancelado_por       uuid,
  add column if not exists cancelamento_motivo text,
  add column if not exists valor_cancelado     numeric(12,2),
  add column if not exists cancelamento        jsonb;

comment on column public.treatment_plans.valor_cancelado is
  'O valor das sessões que sobraram no cancelamento (D4 da 9ª): o plano passa a valer a soma dos procedimentos menos ele — nas Vendas e na comissão.';

-- 2. O núcleo do dinheiro -------------------------------------------------
create or replace function private.cancelamento_dinheiro(
  p_tenant uuid, p_pacote uuid, p_plano uuid, p_usado numeric, p_gravar boolean,
  p_destino text, p_estorno text, p_novo jsonb, p_motivo text, p_ator text,
  p_rotulo text, p_credito text, p_cliente uuid, p_unidade uuid
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_pago        numeric;
  v_aberto      numeric;
  v_cortar      numeric;
  v_cortado     numeric := 0;
  v_devolver    numeric;
  v_resto       numeric;
  v_corte       numeric;
  v_parcelas    jsonb := '[]'::jsonb;
  v_parcial     jsonb;
  v_tx          record;
  v_contra      uuid;
  v_ganho       public.loyalty_transactions%rowtype;
  v_pts         int;
  v_fica        numeric;
  v_destino     text := nullif(upper(trim(coalesce(p_destino, ''))), '');
  v_estorno     text := nullif(upper(trim(coalesce(p_estorno, ''))), '');
  v_novo_metodo text := nullif(upper(trim(coalesce(p_novo ->> 'metodo', ''))), '');
  v_novo_vezes  int  := coalesce(nullif(p_novo ->> 'vezes', '')::int, 1);
begin
  if (p_pacote is null) = (p_plano is null) then
    raise exception 'O cancelamento é de um pacote ou de um plano.' using errcode = 'invalid_parameter_value';
  end if;

  -- O dinheiro do conjunto, vivo (sem o estornado nem o estorno).
  select coalesce(sum(f.amount) filter (where f.is_paid), 0),
         coalesce(sum(f.amount) filter (where not f.is_paid), 0)
    into v_pago, v_aberto
    from public.financial_transactions f
   where (f.client_package_id = p_pacote or f.treatment_plan_id = p_plano) and f.type = 'INCOME'
     and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno';
  v_cortar   := least(v_aberto, greatest(0, round(v_pago + v_aberto - p_usado, 2)));
  v_devolver := greatest(0, round(v_pago - p_usado, 2));

  -- As parcelas que caem (a conta, também para a tela): o mais novo primeiro.
  v_resto := v_cortar;
  for v_tx in
    select f.id, f.amount, f.description, f.due_date
      from public.financial_transactions f
     where (f.client_package_id = p_pacote or f.treatment_plan_id = p_plano) and f.type = 'INCOME' and not f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
     order by f.due_date desc nulls first, f.parcela_numero desc nulls last, f.created_at desc, f.id desc
  loop
    exit when v_resto <= 0;
    v_corte := least(v_resto, v_tx.amount);
    v_parcelas := v_parcelas || jsonb_build_object('id', v_tx.id, 'descricao', v_tx.description, 'vencimento', v_tx.due_date,
                                                   'valor', v_tx.amount, 'cai', v_corte, 'fica', v_tx.amount - v_corte);
    v_resto := v_resto - v_corte;
  end loop;

  -- O pagamento que o estorno pega EM PARTE (na ordem do estorno: do mais
  -- novo para o mais antigo), se houver: é ele que pede a escolha (r2-ven-05).
  if v_devolver > 0 then
    v_resto := v_devolver;
    for v_tx in
      select f.id, f.amount, f.description, f.payment_method, f.cartao_vezes, f.cartao_bandeira
        from public.financial_transactions f
       where (f.client_package_id = p_pacote or f.treatment_plan_id = p_plano) and f.type = 'INCOME' and f.is_paid
         and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
       order by coalesce(f.paid_at, f.created_at) desc, f.created_at desc, f.id desc
    loop
      exit when v_resto <= 0;
      if v_tx.amount <= v_resto then
        v_resto := round(v_resto - v_tx.amount, 2);
      else
        v_parcial := jsonb_build_object(
          'id', v_tx.id, 'descricao', v_tx.description, 'metodo', v_tx.payment_method::text,
          'vezes', v_tx.cartao_vezes, 'bandeira', v_tx.cartao_bandeira, 'valor', v_tx.amount, 'volta', v_resto,
          'fica', round(v_tx.amount - v_resto, 2),
          'cartao', coalesce(v_tx.payment_method::text in ('CREDIT_CARD', 'DEBIT_CARD'), false));
        v_resto := 0;
      end if;
    end loop;
  end if;

  if not p_gravar then
    return jsonb_build_object('pago', v_pago, 'a_receber', v_aberto, 'parcelas', v_parcelas,
                              'cai', v_cortar, 'devolver', v_devolver, 'parcial', v_parcial);
  end if;

  -- O crediário que passa do usado cai.
  for v_tx in
    select f.id, f.amount
      from public.financial_transactions f
     where (f.client_package_id = p_pacote or f.treatment_plan_id = p_plano) and f.type = 'INCOME' and not f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
     order by f.due_date desc nulls first, f.parcela_numero desc nulls last, f.created_at desc, f.id desc
     for update
  loop
    exit when v_cortado >= v_cortar;
    v_corte := least(v_cortar - v_cortado, v_tx.amount);
    if v_corte >= v_tx.amount then
      update public.financial_transactions
         set notes = 'Estornada', estorno_motivo = p_rotulo || ': ' || p_motivo, updated_at = now()
       where id = v_tx.id;
    else
      update public.financial_transactions set amount = amount - v_corte, updated_at = now() where id = v_tx.id;
    end if;
    v_cortado := v_cortado + v_corte;
  end loop;

  -- O pago além do usado volta.
  if v_devolver > 0 and v_destino = 'CREDITO' then
    insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
    values (p_cliente, p_unidade, v_devolver, p_credito, null);
  elsif v_devolver > 0 then
    v_resto := v_devolver;
    for v_tx in
      select f.*
        from public.financial_transactions f
       where (f.client_package_id = p_pacote or f.treatment_plan_id = p_plano) and f.type = 'INCOME' and f.is_paid
         and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
       order by coalesce(f.paid_at, f.created_at) desc, f.created_at desc, f.id desc
       for update
    loop
      exit when v_resto <= 0;
      if v_tx.amount <= v_resto then
        -- O lançamento inteiro: o estorno de sempre (contra-lançamento, crédito, pontos).
        perform public.estornar_transacao(v_tx.id, p_tenant, p_ator, p_motivo);
        v_resto := round(v_resto - v_tx.amount, 2);
      elsif v_estorno = 'INTEIRO' then
        -- r2-ven-05 (b): estorna o pagamento inteiro (o de sempre) e lança o
        -- que fica — o usado — como um pagamento NOVO, pago agora, na forma
        -- escolhida. No cartão é o único caminho (r2-fin-03): as parcelas da
        -- operadora do pagamento caem juntas pelo gatilho, e as do novo
        -- (se for crédito em N vezes) nascem pelo mesmo gatilho.
        v_fica := round(v_tx.amount - v_resto, 2);
        perform public.estornar_transacao(v_tx.id, p_tenant, p_ator, p_motivo);
        insert into public.financial_transactions (
          branch_id, client_id, client_package_id, treatment_plan_id, type, category, description, amount,
          payment_method, cartao_vezes, cartao_bandeira, is_paid, paid_at, created_by
        ) values (
          v_tx.branch_id, v_tx.client_id, p_pacote, p_plano, 'INCOME', v_tx.category,
          v_tx.description || ' — o usado, lançado de novo no cancelamento', v_fica,
          v_novo_metodo::public."PaymentMethod",
          case when v_novo_metodo = 'CREDIT_CARD' and v_novo_vezes >= 2 then v_novo_vezes end,
          private.bandeira_do_cartao(v_novo_metodo, p_novo ->> 'bandeira'),
          true, now(), p_ator
        );
        v_resto := 0;
      else
        -- Em parte: o lançamento fica com o usado, e o resto sai pelo
        -- contra-lançamento, na mesma forma (como estornar_transacao).
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
          v_tx.payment_method, v_tx.cartao_vezes, p_motivo,
          true, now(), p_ator
        ) returning id into v_contra;
        if v_tx.payment_method = 'INTERNAL_CREDIT' and v_tx.client_id is not null then
          insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
          values (v_tx.client_id, v_tx.branch_id, v_resto, 'Estorno parcial: ' || v_tx.description, v_contra);
        end if;
        -- Os pontos daquele pagamento, na proporção do que voltou.
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
                v_contra, v_ganho.appointment_id, v_ganho.treatment_plan_id, v_ganho.expires_at, p_ator
              );
            end if;
          end if;
        end if;
        v_resto := 0;
      end if;
    end loop;
  end if;

  return jsonb_build_object('pago', v_pago, 'a_receber', v_aberto, 'parcelas', v_parcelas,
                            'cai', v_cortar, 'devolver', v_devolver, 'parcial', v_parcial);
end $function$;

revoke all on function private.cancelamento_dinheiro(uuid, uuid, uuid, numeric, boolean, text, text, jsonb, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;

-- O pacote, pelo núcleo (a conta, as recusas e a ordem são as de antes) -----
create or replace function public.pacote_cancelar_devolvendo(p_tenant uuid, p_pacote uuid, p_ator uuid, p_ator_nome text, p_motivo text, p_destino text, p_agendamentos text, p_esperado numeric, p_simular boolean, p_estorno text, p_novo jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_cp          public.client_packages%rowtype;
  v_tenant      uuid;
  v_nome        text;
  v_motivo      text := nullif(trim(coalesce(p_motivo, '')), '');
  v_ator        text := coalesce(p_ator::text, 'sistema');
  v_restantes   int;
  v_total       int;
  v_valor       numeric;
  v_preco       numeric;
  v_usado       numeric;
  v_din         jsonb;
  v_devolver    numeric;
  v_ags         jsonb := '[]'::jsonb;
  v_ids_ags     uuid[] := '{}';
  v_ag          record;
  v_linha       uuid;
  v_fid         boolean;
  v_destino     text := nullif(upper(trim(coalesce(p_destino, ''))), '');
  v_escolha     text := nullif(upper(trim(coalesce(p_agendamentos, ''))), '');
  v_motivo_ag   text;
  v_resultado   jsonb;
  v_parcial     jsonb;
  v_estorno     text := nullif(upper(trim(coalesce(p_estorno, ''))), '');
  v_novo_metodo text := nullif(upper(trim(coalesce(p_novo ->> 'metodo', ''))), '');
  v_novo_vezes  int  := coalesce(nullif(p_novo ->> 'vezes', '')::int, 1);
begin
  if p_simular then
    select * into v_cp from public.client_packages cp where cp.id = p_pacote;
  else
    select * into v_cp from public.client_packages cp where cp.id = p_pacote for update;
  end if;
  if not found then
    raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
  end if;
  select b.tenant_id into v_tenant from public.branches b where b.id = v_cp.branch_id;
  if v_tenant is distinct from p_tenant then
    raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_cp.cancelado_em is not null then
    raise exception 'Este pacote já foi cancelado.' using errcode = 'invalid_parameter_value';
  end if;
  if v_cp.expires_at is not null and v_cp.expires_at < now() then
    raise exception 'Este pacote venceu em %: as sessões que sobraram não se devolvem.',
      to_char(v_cp.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  select sp.name into v_nome from public.service_packages sp where sp.id = v_cp.package_id;

  if exists (
    select 1 from public.package_sessions s join public.appointments a on a.id = s.appointment_id
     where s.client_package_id = p_pacote and s.status = 'AVAILABLE' and a.status in ('ARRIVED', 'IN_PROGRESS')
  ) then
    raise exception 'Há uma sessão deste pacote em atendimento agora: conclua o atendimento antes de cancelar o pacote.' using errcode = 'P0001';
  end if;

  -- As sessões que sobraram e o valor delas: a parte de cada uma no rateio
  -- (sem a parte gravada — o pacote de antes do rateio —, o preço ÷ sessões).
  select count(*) filter (where s.status = 'AVAILABLE'), count(*),
         coalesce(sum(coalesce(s.preco, round(v_cp.price / greatest(v_cp.total_sessions, 1), 2)))
                    filter (where s.status = 'AVAILABLE'), 0)
    into v_restantes, v_total, v_valor
    from public.package_sessions s where s.client_package_id = p_pacote;
  if v_restantes = 0 then
    raise exception 'Todas as sessões deste pacote já foram feitas: não há o que cancelar.' using errcode = 'P0001';
  end if;
  v_preco := coalesce(v_cp.price, 0);
  v_valor := least(round(v_valor, 2), v_preco);
  v_usado := round(v_preco - v_valor, 2);

  select coalesce(c.enabled, false) into v_fid from public.loyalty_configs c where c.tenant_id = p_tenant;

  -- As sessões já agendadas (ainda não atendidas).
  for v_ag in
    select a.id, a.scheduled_at, a.price, pr.name as procedimento, u.name as profissional
      from public.package_sessions s
      join public.appointments a on a.id = s.appointment_id
      left join public.procedures pr on pr.id = a.procedure_id
      left join public.users u on u.id = a.professional_id
     where s.client_package_id = p_pacote and s.status = 'AVAILABLE'
       and a.status in ('SCHEDULED', 'CONFIRMED')
     order by a.scheduled_at, a.id
  loop
    v_ids_ags := v_ids_ags || v_ag.id;
    v_ags := v_ags || jsonb_build_object('id', v_ag.id, 'quando', v_ag.scheduled_at, 'preco', v_ag.price,
                                         'procedimento', v_ag.procedimento, 'profissional', v_ag.profissional);
  end loop;

  -- O dinheiro (o núcleo, simulando): o pago, o a receber, as parcelas que
  -- caem, o que volta e o pagamento pego em parte.
  v_din := private.cancelamento_dinheiro(p_tenant, p_pacote, null, v_usado, false,
                                         null, null, null, null, v_ator, null, null, null, null);
  v_devolver := (v_din ->> 'devolver')::numeric;
  v_parcial  := nullif(v_din -> 'parcial', 'null'::jsonb);

  v_resultado := jsonb_build_object(
    'pacote', coalesce(v_nome, 'Pacote'), 'preco', v_preco, 'sessoes', v_total, 'restantes', v_restantes,
    'valor_restante', v_valor, 'usado', v_usado, 'pago', (v_din ->> 'pago')::numeric, 'a_receber', (v_din ->> 'a_receber')::numeric,
    'parcelas', v_din -> 'parcelas', 'cai', (v_din ->> 'cai')::numeric, 'devolver', v_devolver,
    'fidelidade', coalesce(v_fid, false), 'agendamentos', v_ags, 'parcial', v_parcial);

  if p_simular then
    return v_resultado;
  end if;

  -- Daqui em diante, grava. As escolhas que a tela tem de ter feito:
  if v_motivo is null then
    raise exception 'Diga o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  if round(coalesce(p_esperado, -1), 2) <> v_devolver then
    raise exception 'Os valores do pacote mudaram desde que a janela abriu: feche e abra de novo.' using errcode = 'P0001';
  end if;
  if v_devolver > 0 and v_destino is distinct from 'ESTORNO' and v_destino is distinct from 'CREDITO' then
    raise exception 'Diga como devolver o que a cliente pagou além do usado: estorno ou crédito na clínica.' using errcode = 'P0001';
  end if;
  if cardinality(v_ids_ags) > 0 and v_escolha is distinct from 'CANCELAR' and v_escolha is distinct from 'SOLTAR' then
    raise exception 'Diga o que fazer com as sessões já agendadas: cancelar ou manter como avulso.' using errcode = 'P0001';
  end if;
  -- r2-ven-05 / r2-fin-03: como estornar o pagamento que volta em parte.
  if v_destino = 'ESTORNO' and v_parcial is not null then
    if v_estorno is null and not (v_parcial ->> 'cartao')::boolean then
      v_estorno := 'PARCIAL';   -- o chamador de antes (pacote_cancelar), fora do cartão
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

  -- 1. As sessões agendadas.
  if cardinality(v_ids_ags) > 0 then
    if v_escolha = 'CANCELAR' then
      v_motivo_ag := 'Pacote cancelado: ' || v_motivo;
      -- O gatilho pre_pago_libera solta a sessão do agendamento cancelado.
      update public.appointments
         set status = 'CANCELLED', cancelled_at = now(), cancellation_reason = v_motivo_ag
       where id = any (v_ids_ags) and status in ('SCHEDULED', 'CONFIRMED');
      if p_ator is not null then
        insert into public.appointment_history (appointment_id, changed_by_id, changed_by_name, action, description)
        select x, p_ator, coalesce(p_ator_nome, 'Usuário'), 'CANCELLED', 'Cancelado: ' || v_motivo_ag
          from unnest(v_ids_ags) x;
      end if;
    else
      -- Fica como atendimento avulso, com o preço que tinha (a parte da sessão).
      update public.package_sessions
         set appointment_id = null
       where client_package_id = p_pacote and appointment_id = any (v_ids_ags);
      if p_ator is not null then
        insert into public.appointment_history (appointment_id, changed_by_id, changed_by_name, action, description)
        select x, p_ator, coalesce(p_ator_nome, 'Usuário'), 'EDITED',
               'O pacote ' || coalesce(v_nome, '') || ' foi cancelado: fica como atendimento avulso, a cobrar'
          from unnest(v_ids_ags) x;
      end if;
    end if;
  end if;

  -- 2. As sessões que sobraram.
  update public.package_sessions
     set status = 'CANCELLED', appointment_id = null
   where client_package_id = p_pacote and status = 'AVAILABLE';

  -- 3. O pacote: o retrato do cancelamento. Daqui em diante ele vale o usado.
  update public.client_packages
     set cancelado_em = now(), cancelado_por = p_ator, cancelamento_motivo = v_motivo,
         valor_cancelado = v_valor,
         cancelamento = v_resultado || jsonb_build_object(
           'destino', case when v_devolver > 0 then v_destino end,
           'agendamentos_escolha', case when cardinality(v_ids_ags) > 0 then v_escolha end,
           'estorno', case when v_destino = 'ESTORNO' and v_parcial is not null then v_estorno end,
           'novo', case when v_estorno = 'INTEIRO' then jsonb_build_object('metodo', v_novo_metodo, 'vezes', v_novo_vezes) end,
           'por', p_ator_nome)
   where id = p_pacote;

  -- 4. A comissão, já pelo novo valor do pacote (o dinheiro ainda não mexeu).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.client_package_id = p_pacote and cl.status <> 'CANCELADA'
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do pacote', null);
  end loop;

  -- 5 e 6. O crediário que passa do usado cai, e o pago além do usado volta.
  perform private.cancelamento_dinheiro(p_tenant, p_pacote, null, v_usado, true,
    v_destino, v_estorno, p_novo, v_motivo, v_ator, 'Pacote cancelado',
    'Cancelamento do pacote ' || coalesce(v_nome, '') || ' (' || v_restantes || ' sessões)', v_cp.client_id, v_cp.branch_id);

  -- 7. A comissão de novo, agora com o dinheiro do fim (idempotente).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.client_package_id = p_pacote and cl.status <> 'CANCELADA'
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do pacote', null);
  end loop;

  return v_resultado || jsonb_build_object(
    'cancelados', case when v_escolha = 'CANCELAR' then to_jsonb(v_ids_ags) else '[]'::jsonb end,
    'soltos',     case when v_escolha = 'SOLTAR'   then to_jsonb(v_ids_ags) else '[]'::jsonb end,
    'destino',    case when v_devolver > 0 then v_destino end,
    'estorno',    case when v_destino = 'ESTORNO' and v_parcial is not null then v_estorno end);
end $function$;

-- 3. O plano ---------------------------------------------------------------
create or replace function public.plano_cancelar_devolvendo(p_tenant uuid, p_plano uuid, p_ator uuid, p_ator_nome text, p_motivo text, p_destino text, p_agendamentos text, p_esperado numeric, p_simular boolean, p_estorno text, p_novo jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_tp          public.treatment_plans%rowtype;
  v_tenant      uuid;
  v_nome        text;
  v_motivo      text := nullif(trim(coalesce(p_motivo, '')), '');
  v_ator        text := coalesce(p_ator::text, 'sistema');
  v_restantes   int;
  v_total       int;
  v_valor       numeric;
  v_preco       numeric;
  v_usado       numeric;
  v_din         jsonb;
  v_devolver    numeric;
  v_ags         jsonb := '[]'::jsonb;
  v_ids_ags     uuid[] := '{}';
  v_ag          record;
  v_linha       uuid;
  v_fid         boolean;
  v_destino     text := nullif(upper(trim(coalesce(p_destino, ''))), '');
  v_escolha     text := nullif(upper(trim(coalesce(p_agendamentos, ''))), '');
  v_motivo_ag   text;
  v_resultado   jsonb;
  v_parcial     jsonb;
  v_estorno     text := nullif(upper(trim(coalesce(p_estorno, ''))), '');
  v_novo_metodo text := nullif(upper(trim(coalesce(p_novo ->> 'metodo', ''))), '');
  v_novo_vezes  int  := coalesce(nullif(p_novo ->> 'vezes', '')::int, 1);
begin
  if p_simular then
    select * into v_tp from public.treatment_plans tp where tp.id = p_plano;
  else
    select * into v_tp from public.treatment_plans tp where tp.id = p_plano for update;
  end if;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'no_data_found';
  end if;
  select b.tenant_id into v_tenant from public.branches b where b.id = v_tp.branch_id;
  if v_tenant is distinct from p_tenant then
    raise exception 'Plano não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_tp.status = 'CANCELLED' or v_tp.cancelado_em is not null then
    raise exception 'Este plano já foi cancelado.' using errcode = 'invalid_parameter_value';
  end if;
  if v_tp.status = 'COMPLETED' then
    raise exception 'Todas as sessões deste plano já foram feitas: não há o que cancelar.' using errcode = 'P0001';
  end if;
  if v_tp.status <> 'ACCEPTED' then
    raise exception 'Só o plano fechado se cancela aqui: o que ainda está no checkout se desfaz em "Cancelar checkout".' using errcode = 'P0001';
  end if;
  v_nome := coalesce(nullif(btrim(v_tp.name), ''), 'Plano de tratamento');

  if exists (
    select 1 from public.treatment_plan_sessions s join public.appointments a on a.id = s.appointment_id
     where s.plan_id = p_plano and a.status in ('ARRIVED', 'IN_PROGRESS')
  ) then
    raise exception 'Há uma sessão deste plano em atendimento agora: conclua o atendimento antes de cancelar o plano.' using errcode = 'P0001';
  end if;

  -- As sessões que sobraram e o valor delas: cada uma pelo preço dos
  -- procedimentos dela no plano (já com o desconto rateado). Feita é a sessão
  -- com o agendamento concluído.
  with sessao as (
    select s.id,
           coalesce((select sum(p.price) from public.treatment_plan_session_procedures p where p.session_id = s.id), 0) as valor,
           exists (select 1 from public.appointments a where a.id = s.appointment_id and a.status = 'COMPLETED') as feita
      from public.treatment_plan_sessions s where s.plan_id = p_plano
  )
  select count(*) filter (where not feita), count(*),
         coalesce(sum(valor) filter (where not feita), 0), coalesce(sum(valor), 0)
    into v_restantes, v_total, v_valor, v_preco
    from sessao;
  if v_restantes = 0 then
    raise exception 'Todas as sessões deste plano já foram feitas: não há o que cancelar.' using errcode = 'P0001';
  end if;
  v_preco := round(v_preco, 2);
  v_valor := least(round(v_valor, 2), v_preco);
  v_usado := round(v_preco - v_valor, 2);

  select coalesce(c.enabled, false) into v_fid from public.loyalty_configs c where c.tenant_id = p_tenant;

  -- As sessões já agendadas (ainda não atendidas), com o preço da sessão.
  for v_ag in
    select a.id, a.scheduled_at,
           coalesce((select sum(p.price) from public.treatment_plan_session_procedures p where p.session_id = s.id), 0) as preco,
           pr.name as procedimento, u.name as profissional
      from public.treatment_plan_sessions s
      join public.appointments a on a.id = s.appointment_id
      left join public.procedures pr on pr.id = a.procedure_id
      left join public.users u on u.id = a.professional_id
     where s.plan_id = p_plano and a.status in ('SCHEDULED', 'CONFIRMED')
     order by a.scheduled_at, a.id
  loop
    v_ids_ags := v_ids_ags || v_ag.id;
    v_ags := v_ags || jsonb_build_object('id', v_ag.id, 'quando', v_ag.scheduled_at, 'preco', v_ag.preco,
                                         'procedimento', v_ag.procedimento, 'profissional', v_ag.profissional);
  end loop;

  v_din := private.cancelamento_dinheiro(p_tenant, null, p_plano, v_usado, false,
                                         null, null, null, null, v_ator, null, null, null, null);
  v_devolver := (v_din ->> 'devolver')::numeric;
  v_parcial  := nullif(v_din -> 'parcial', 'null'::jsonb);

  v_resultado := jsonb_build_object(
    'tipo', 'PLANO', 'pacote', v_nome, 'preco', v_preco, 'sessoes', v_total, 'restantes', v_restantes,
    'valor_restante', v_valor, 'usado', v_usado, 'pago', (v_din ->> 'pago')::numeric, 'a_receber', (v_din ->> 'a_receber')::numeric,
    'parcelas', v_din -> 'parcelas', 'cai', (v_din ->> 'cai')::numeric, 'devolver', v_devolver,
    'fidelidade', coalesce(v_fid, false), 'agendamentos', v_ags, 'parcial', v_parcial);

  if p_simular then
    return v_resultado;
  end if;

  if v_motivo is null then
    raise exception 'Diga o motivo do cancelamento.' using errcode = 'P0001';
  end if;
  if round(coalesce(p_esperado, -1), 2) <> v_devolver then
    raise exception 'Os valores do plano mudaram desde que a janela abriu: feche e abra de novo.' using errcode = 'P0001';
  end if;
  if v_devolver > 0 and v_destino is distinct from 'ESTORNO' and v_destino is distinct from 'CREDITO' then
    raise exception 'Diga como devolver o que a cliente pagou além do usado: estorno ou crédito na clínica.' using errcode = 'P0001';
  end if;
  if cardinality(v_ids_ags) > 0 and v_escolha is distinct from 'CANCELAR' and v_escolha is distinct from 'SOLTAR' then
    raise exception 'Diga o que fazer com as sessões já agendadas: cancelar ou manter como avulso.' using errcode = 'P0001';
  end if;
  if v_destino = 'ESTORNO' and v_parcial is not null then
    if v_estorno is null and not (v_parcial ->> 'cartao')::boolean then
      v_estorno := 'PARCIAL';
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

  -- 1. As sessões agendadas.
  if cardinality(v_ids_ags) > 0 then
    if v_escolha = 'CANCELAR' then
      v_motivo_ag := 'Plano cancelado: ' || v_motivo;
      -- O gatilho pre_pago_libera solta a sessão do agendamento cancelado.
      update public.appointments
         set status = 'CANCELLED', cancelled_at = now(), cancellation_reason = v_motivo_ag
       where id = any (v_ids_ags) and status in ('SCHEDULED', 'CONFIRMED');
      if p_ator is not null then
        insert into public.appointment_history (appointment_id, changed_by_id, changed_by_name, action, description)
        select x, p_ator, coalesce(p_ator_nome, 'Usuário'), 'CANCELLED', 'Cancelado: ' || v_motivo_ag
          from unnest(v_ids_ags) x;
      end if;
    else
      -- Fica como atendimento avulso, a cobrar, com o preço da sessão no plano.
      update public.appointments a
         set treatment_plan_id = null,
             price = coalesce((select sum(p.price) from public.treatment_plan_sessions s
                                 join public.treatment_plan_session_procedures p on p.session_id = s.id
                                where s.plan_id = p_plano and s.appointment_id = a.id), a.price)
       where a.id = any (v_ids_ags);
      update public.treatment_plan_sessions
         set appointment_id = null
       where plan_id = p_plano and appointment_id = any (v_ids_ags);
      if p_ator is not null then
        insert into public.appointment_history (appointment_id, changed_by_id, changed_by_name, action, description)
        select x, p_ator, coalesce(p_ator_nome, 'Usuário'), 'EDITED',
               'O plano ' || v_nome || ' foi cancelado: fica como atendimento avulso, a cobrar'
          from unnest(v_ids_ags) x;
      end if;
    end if;
  end if;

  -- 2 e 3. O plano: cancelado, com o retrato. Daqui em diante ele vale o usado.
  update public.treatment_plans
     set status = 'CANCELLED', updated_at = now(),
         cancelado_em = now(), cancelado_por = p_ator, cancelamento_motivo = v_motivo,
         valor_cancelado = v_valor,
         cancelamento = v_resultado || jsonb_build_object(
           'destino', case when v_devolver > 0 then v_destino end,
           'agendamentos_escolha', case when cardinality(v_ids_ags) > 0 then v_escolha end,
           'estorno', case when v_destino = 'ESTORNO' and v_parcial is not null then v_estorno end,
           'novo', case when v_estorno = 'INTEIRO' then jsonb_build_object('metodo', v_novo_metodo, 'vezes', v_novo_vezes) end,
           'por', p_ator_nome)
   where id = p_plano;

  -- 4. A comissão, já pelo novo valor do plano (o dinheiro ainda não mexeu).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.treatment_plan_id = p_plano and cl.origem = 'PLANO' and cl.status <> 'CANCELADA'
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do plano', null);
  end loop;

  -- 5 e 6. O crediário que passa do usado cai, e o pago além do usado volta.
  perform private.cancelamento_dinheiro(p_tenant, null, p_plano, v_usado, true,
    v_destino, v_estorno, p_novo, v_motivo, v_ator, 'Plano cancelado',
    'Cancelamento do plano ' || v_nome || ' (' || v_restantes || ' sessões)', v_tp.client_id, v_tp.branch_id);

  -- 7. A comissão de novo, agora com o dinheiro do fim (idempotente).
  for v_linha in
    select cl.id from public.commission_lines cl
     where cl.treatment_plan_id = p_plano and cl.origem = 'PLANO' and cl.status <> 'CANCELADA'
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, 'Cancelamento do plano', null);
  end loop;

  -- 8. A linha do tempo da avaliação que gerou o plano.
  if v_tp.evaluation_appointment_id is not null and p_ator is not null then
    insert into public.appointment_history (appointment_id, changed_by_id, changed_by_name, action, description)
    values (v_tp.evaluation_appointment_id, p_ator, coalesce(p_ator_nome, 'Usuário'), 'TREATMENT_CANCELLED', 'Plano cancelado: ' || v_motivo);
  end if;

  return v_resultado || jsonb_build_object(
    'cancelados', case when v_escolha = 'CANCELAR' then to_jsonb(v_ids_ags) else '[]'::jsonb end,
    'soltos',     case when v_escolha = 'SOLTAR'   then to_jsonb(v_ids_ags) else '[]'::jsonb end,
    'destino',    case when v_devolver > 0 then v_destino end,
    'estorno',    case when v_destino = 'ESTORNO' and v_parcial is not null then v_estorno end);
end $function$;

revoke execute on function public.plano_cancelar_devolvendo(uuid, uuid, uuid, text, text, text, text, numeric, boolean, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.plano_cancelar_devolvendo(uuid, uuid, uuid, text, text, text, text, numeric, boolean, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
