-- CANCELAR PACOTE (F2b da 5ª simulação; decisão do Heitor, 2026-11-01:
-- "concordo"). A cliente compra 6, faz 2 e desiste — e não havia o que fazer.
--
-- pacote_cancelar, UMA transação (o app só mostra a conta que ela devolve com
-- p_simular): as sessões que sobraram ficam CANCELADAS, e o valor delas (o
-- rateio do pacote, com o desconto: a soma de package_sessions.preco) é o que
-- o pacote deixa de valer. O que foi usado é o preço vendido menos isso.
-- 1. As sessões já agendadas: canceladas, ou mantidas como atendimento avulso
--    (soltas do pacote, com o preço que tinham) — a recepção escolhe.
-- 2. O crediário: o a receber que passa do usado cai ANTES de devolver
--    qualquer coisa (o mais novo primeiro; a parcela inteira sai marcada
--    'Estornada', sem contra-lançamento, como no estorno da venda de produto;
--    a que cai em parte diminui).
-- 3. O pago além do usado volta: como ESTORNO (o estorno de sempre,
--    estornar_transacao, lançamento a lançamento do mais novo; o último em
--    parte — o lançamento fica com o que sobrou, e o contra-lançamento
--    "Estorno parcial" leva o resto, com os pontos na proporção) ou como
--    CRÉDITO na clínica (internal_credits; o dinheiro fica, e os pontos
--    também — o dinheiro não voltou).
-- 4. A comissão: comissao_conta passa a ler o pacote pelo que vale depois do
--    cancelamento — a venda na proporção do que ficou (também a PREVISTA, que
--    ainda aguarda o pagamento integral, H4), e a quitação pelo usado. A de
--    execução das sessões feitas fica.
--
-- E a sobra (b) da F3: metrics_vendas conta o pacote pelo que ficou dele e o
-- pré-pago sem as unidades canceladas; o que caiu inteiro sai das Vendas.

-- 0. O retrato do cancelamento no pacote da cliente --------------------------
alter table public.client_packages
  add column if not exists cancelado_em        timestamptz,
  add column if not exists cancelado_por       uuid references public.users(id) on delete set null,
  add column if not exists cancelamento_motivo text,
  add column if not exists valor_cancelado     numeric not null default 0,
  add column if not exists cancelamento        jsonb;

-- 1. A conta da comissão: o pacote pelo que vale depois do cancelamento -------
-- Partiu do corpo de produção de private.comissao_conta (2026-11-01, F2).
create or replace function private.comissao_conta(p_linha uuid, out alvo numeric, out previsto numeric, out quitado boolean)
returns record
language plpgsql
stable security definer
set search_path to ''
as $function$
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
  v_vezes     int;
  v_total     numeric;
  v_recebido  numeric;
  v_quitado   numeric;
  v_dvenda    numeric := 0;
  v_fica      numeric;
begin
  alvo := 0; previsto := 0; quitado := false;
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return;
  end if;
  quitado := true;

  if v_l.origem = 'AVULSO' then
    select f.is_paid and coalesce(f.notes, '') <> 'Estornada',
           coalesce(f.notes, '') = 'Estornada',
           coalesce(f.loyalty_discount, 0),
           f.payment_method::text,
           coalesce(f.sale_discount, 0),
           f.cartao_vezes
      into v_pago, v_estornado, v_desconto, v_metodo, v_dvenda, v_vezes
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME'
     order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
     limit 1;
    v_pago      := coalesce(v_pago, false);
    v_estornado := coalesce(v_estornado, false);
    if v_pago then
      v_taxa := private.comissao_taxa_pct(v_l.tenant_id, v_metodo, coalesce(v_vezes, 1));
    else
      v_desconto := 0;
      v_dvenda   := 0;
    end if;
    v_dvenda := coalesce(v_dvenda, 0);
    quitado  := v_pago;
    v_fracao := case
      when v_l.modo in ('PAGAMENTO', 'INTEGRAL') then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    -- PAGAMENTO era sempre "sobre o pago"; INTEGRAL e ATENDIMENTO seguem a
    -- base com pontos da configuração (retratada na linha).
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and v_l.client_package_id is not null)
        or (v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null)
        or (v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null) then
    if v_l.origem = 'PLANO' then
      select coalesce(sum(p.price), 0) into v_total
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
       where s.plan_id = v_l.treatment_plan_id;
    elsif v_l.origem in ('PACOTE', 'PACOTE_VENDA') then
      -- O pacote cancelado vale o que foi usado (F2b): o preço vendido menos
      -- as sessões canceladas.
      select cp.price - coalesce(cp.valor_cancelado, 0) into v_total
        from public.client_packages cp where cp.id = v_l.client_package_id;
    elsif v_l.origem = 'PRODUTO' then
      select ps.price into v_total from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0)
        into v_total
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;
    select coalesce(sum(f.amount), 0),
           -- Pontos são forma de pagamento: quitam como o dinheiro.
           coalesce(sum(f.amount + coalesce(f.loyalty_discount, 0)), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1)))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_quitado, v_taxa
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id)
         or (v_l.origem = 'PRODUTO' and f.product_sale_id = v_l.product_sale_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    -- Sem preço de venda (o pacote de antes da venda no sistema): libera na conclusão, como sempre.
    quitado := v_total is null or v_total <= 0 or round(v_quitado, 2) >= round(v_total, 2);
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    elsif v_l.modo = 'INTEGRAL' then
      v_fracao := case when quitado then 1 else 0 end;
    end if;

  else
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    v_valor := case when v_l.preco > 0
      then round(v_l.regra_valor * (v_l.preco - least(v_desconto, v_l.preco)) / v_l.preco, 2)
      else v_l.regra_valor end;
  else
    v_base := v_l.preco - least(v_desconto + v_dvenda, v_l.preco);
    if v_l.desconta_taxa then
      v_base := v_base - round(v_base * v_taxa / 100, 2);
    end if;
    if v_l.desconta_insumos then
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_valor := round(greatest(v_base, 0) * v_l.regra_valor / 100, 2);
  end if;

  -- A comissão de VENDA do pacote cancelado volta na proporção do que foi
  -- cancelado (F2b) — o previsto também, para não liberar sobre o que caiu.
  if v_l.origem = 'PACOTE_VENDA' and v_l.client_package_id is not null then
    select case when coalesce(cp.price, 0) > 0
                then greatest(cp.price - coalesce(cp.valor_cancelado, 0), 0) / cp.price
                else 1 end
      into v_fica
      from public.client_packages cp where cp.id = v_l.client_package_id;
    v_valor := round(v_valor * coalesce(v_fica, 1), 2);
  end if;

  previsto := v_valor;
  alvo     := round(v_valor * v_fracao, 2);
end $function$;
revoke execute on function private.comissao_conta(uuid) from public;

-- 2. Cancelar o pacote ---------------------------------------------------------
create or replace function public.pacote_cancelar(
  p_tenant       uuid,
  p_pacote       uuid,
  p_ator         uuid,
  p_ator_nome    text,
  p_motivo       text,
  p_destino      text,
  p_agendamentos text,
  p_esperado     numeric,
  p_simular      boolean default false
)
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
  v_pago        numeric;
  v_aberto      numeric;
  v_cortar      numeric;
  v_cortado     numeric := 0;
  v_devolver    numeric;
  v_resto       numeric;
  v_corte       numeric;
  v_parcelas    jsonb := '[]'::jsonb;
  v_ags         jsonb := '[]'::jsonb;
  v_ids_ags     uuid[] := '{}';
  v_tx          record;
  v_ag          record;
  v_contra      uuid;
  v_ganho       public.loyalty_transactions%rowtype;
  v_pts         int;
  v_linha       uuid;
  v_fid         boolean;
  v_destino     text := nullif(upper(trim(coalesce(p_destino, ''))), '');
  v_escolha     text := nullif(upper(trim(coalesce(p_agendamentos, ''))), '');
  v_motivo_ag   text;
  v_resultado   jsonb;
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

  -- O dinheiro do pacote, vivo (sem o estornado nem o estorno).
  select coalesce(sum(f.amount) filter (where f.is_paid), 0),
         coalesce(sum(f.amount) filter (where not f.is_paid), 0)
    into v_pago, v_aberto
    from public.financial_transactions f
   where f.client_package_id = p_pacote and f.type = 'INCOME'
     and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno';
  v_cortar   := least(v_aberto, greatest(0, round(v_pago + v_aberto - v_usado, 2)));
  v_devolver := greatest(0, round(v_pago - v_usado, 2));

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

  -- As parcelas que caem (a conta, também para a tela): o mais novo primeiro.
  v_resto := v_cortar;
  for v_tx in
    select f.id, f.amount, f.description, f.due_date
      from public.financial_transactions f
     where f.client_package_id = p_pacote and f.type = 'INCOME' and not f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
     order by f.due_date desc nulls first, f.parcela_numero desc nulls last, f.created_at desc, f.id desc
  loop
    exit when v_resto <= 0;
    v_corte := least(v_resto, v_tx.amount);
    v_parcelas := v_parcelas || jsonb_build_object('id', v_tx.id, 'descricao', v_tx.description, 'vencimento', v_tx.due_date,
                                                   'valor', v_tx.amount, 'cai', v_corte, 'fica', v_tx.amount - v_corte);
    v_resto := v_resto - v_corte;
  end loop;

  v_resultado := jsonb_build_object(
    'pacote', coalesce(v_nome, 'Pacote'), 'preco', v_preco, 'sessoes', v_total, 'restantes', v_restantes,
    'valor_restante', v_valor, 'usado', v_usado, 'pago', v_pago, 'a_receber', v_aberto,
    'parcelas', v_parcelas, 'cai', v_cortar, 'devolver', v_devolver,
    'fidelidade', coalesce(v_fid, false), 'agendamentos', v_ags);

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

  -- 5. O crediário que passa do usado cai.
  for v_tx in
    select f.id, f.amount
      from public.financial_transactions f
     where f.client_package_id = p_pacote and f.type = 'INCOME' and not f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
     order by f.due_date desc nulls first, f.parcela_numero desc nulls last, f.created_at desc, f.id desc
     for update
  loop
    exit when v_cortado >= v_cortar;
    v_corte := least(v_cortar - v_cortado, v_tx.amount);
    if v_corte >= v_tx.amount then
      update public.financial_transactions
         set notes = 'Estornada', estorno_motivo = 'Pacote cancelado: ' || v_motivo, updated_at = now()
       where id = v_tx.id;
    else
      update public.financial_transactions set amount = amount - v_corte, updated_at = now() where id = v_tx.id;
    end if;
    v_cortado := v_cortado + v_corte;
  end loop;

  -- 6. O pago além do usado volta.
  if v_devolver > 0 and v_destino = 'CREDITO' then
    insert into public.internal_credits (client_id, branch_id, amount, description, transaction_id)
    values (v_cp.client_id, v_cp.branch_id, v_devolver,
            'Cancelamento do pacote ' || coalesce(v_nome, '') || ' (' || v_restantes || ' sessões)', null);
  elsif v_devolver > 0 then
    v_resto := v_devolver;
    for v_tx in
      select f.*
        from public.financial_transactions f
       where f.client_package_id = p_pacote and f.type = 'INCOME' and f.is_paid
         and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno' and f.amount > 0
       order by coalesce(f.paid_at, f.created_at) desc, f.created_at desc, f.id desc
       for update
    loop
      exit when v_resto <= 0;
      if v_tx.amount <= v_resto then
        -- O lançamento inteiro: o estorno de sempre (contra-lançamento, crédito, pontos).
        perform public.estornar_transacao(v_tx.id, p_tenant, v_ator, v_motivo);
        v_resto := round(v_resto - v_tx.amount, 2);
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
          v_tx.payment_method, v_tx.cartao_vezes, v_motivo,
          true, now(), v_ator
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
                v_contra, v_ganho.appointment_id, v_ganho.treatment_plan_id, v_ganho.expires_at, v_ator
              );
            end if;
          end if;
        end if;
        v_resto := 0;
      end if;
    end loop;
  end if;

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
    'destino',    case when v_devolver > 0 then v_destino end);
end $function$;
revoke execute on function public.pacote_cancelar(uuid, uuid, uuid, text, text, text, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.pacote_cancelar(uuid, uuid, uuid, text, text, text, text, numeric, boolean) to service_role;

-- 3. As Vendas: o pacote pelo que ficou dele, o pré-pago sem as unidades
--    canceladas; o que caiu inteiro sai. Partiu do corpo de produção de
--    metrics_vendas (2026-11-01, F3).
create or replace function public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
returns table(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric)
language sql
stable
set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  )
  select a.id, 'PROCEDIMENTO', a.aconteceu_em, pr.name, 1,
         a.client_id, c.name, u.name, a.branch_id,
         a.price - coalesce(t.sale_discount, 0)
    from public.appointments a
    join scope s on s.id = a.branch_id
    join public.procedures pr on pr.id = a.procedure_id
    left join public.clients c on c.id = a.client_id
    left join public.users u on u.id = a.professional_id
    left join lateral (
      select f.sale_discount from public.financial_transactions f
       where f.appointment_id = a.id
       order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
       limit 1
    ) t on true
   where a.status = 'COMPLETED'
     and a.aconteceu_em between p_from and p_to
     and a.price > 0
     and a.treatment_plan_id is null
     and not exists (select 1 from public.package_sessions x where x.appointment_id = a.id)
     and not exists (select 1 from public.procedure_sale_units x where x.appointment_id = a.id)
     and (p_professional_id is null or a.professional_id = p_professional_id)

  -- O pacote cancelado vale o que foi usado (F2b, 2026-11-01); cancelado
  -- sem nenhuma sessão feita, sai.
  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price - coalesce(cp.valor_cancelado, 0)
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
   where cp.purchased_at between p_from and p_to
     and (cp.cancelado_em is null or coalesce(cp.price, 0) - coalesce(cp.valor_cancelado, 0) > 0)
     and (p_professional_id is null or cp.sold_by = p_professional_id)

  -- O pré-pago vale sem as unidades canceladas (procedimento_cancelar_unidade:
  -- "a venda passa a valer menos"); todas canceladas, sai.
  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price - coalesce(x.cancelado, 0)
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
    left join lateral (
      select sum(un.preco) cancelado from public.procedure_sale_units un
       where un.sale_id = v.id and un.status = 'CANCELADA'
    ) x on true
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to
     and (coalesce(x.cancelado, 0) = 0 or v.price - x.cancelado > 0)
     and (p_professional_id is null or v.sold_by = p_professional_id)

  union all
  select tp.id, 'PLANO', tp.aceito_em, coalesce(nullif(btrim(tp.name), ''), 'Plano de tratamento'),
         (select count(*)::integer from public.treatment_plan_sessions x where x.plan_id = tp.id),
         tp.client_id, c.name, u.name, tp.branch_id,
         coalesce((select sum(x.price)
                     from public.treatment_plan_session_procedures x
                     join public.treatment_plan_sessions ss on ss.id = x.session_id
                    where ss.plan_id = tp.id), 0)
    from public.treatment_plans tp
    join scope s on s.id = tp.branch_id
    left join public.clients c on c.id = tp.client_id
    left join public.users u on u.id = tp.professional_id
   where tp.status in ('ACCEPTED', 'COMPLETED')
     and tp.aceito_em between p_from and p_to
     and (p_professional_id is null or tp.professional_id = p_professional_id)

  -- A venda de produto (D4, 2026-10-30): na data da venda, pelo vendido, e
  -- "quem vendeu" na coluna Profissional (o recorte do "só os meus"). A
  -- ESTORNADA não é venda (H2, 2026-11-01).
  union all
  select ps.id, 'PRODUTO', ps.sold_at, p.name, ps.quantity,
         ps.client_id, c.name, u.name, ps.branch_id, ps.price
    from public.product_sales ps
    join scope s on s.id = ps.branch_id
    join public.products p on p.id = ps.product_id
    left join public.clients c on c.id = ps.client_id
    left join public.users u on u.id = ps.sold_by
   where ps.tenant_id = p_tenant
     and ps.estornada_em is null
     and ps.sold_at between p_from and p_to
     and (p_professional_id is null or ps.sold_by = p_professional_id)
$function$;

notify pgrst, 'reload schema';
