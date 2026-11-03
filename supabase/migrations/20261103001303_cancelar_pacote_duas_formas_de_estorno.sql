-- r2-ven-05 e r2-fin-03 (F13; o Heitor, 2026-11-03).
--
-- r2-ven-05: "dar as duas opções, não sabemos como a operadora da clínica vai
-- lidar com essa parte de estorno, não sabemos se vai ser possível fazer
-- estorno parcial, então precisamos dar opção. flexibilidade". No
-- cancelamento do pacote, quando o que volta é MENOR que um pagamento, a
-- recepção escolhe:
--   (a) PARCIAL — como era: o pagamento passa a valer o usado e um "Estorno
--       parcial" (contra-lançamento na mesma forma) leva o resto;
--   (b) INTEIRO — estorna o pagamento todo (o estorno de sempre,
--       estornar_transacao) e lança um pagamento NOVO do que fica, na forma
--       que a recepção escolher (`p_novo`: metodo e vezes), pago agora.
--
-- r2-fin-03: "estornar no cartão estorna a venda inteira, todas as operadoras
-- fazem assim". No cartão (crédito, em qualquer número de vezes, e débito) o
-- estorno é sempre do valor inteiro daquele pagamento: a opção (a) não existe
-- — a função a recusa, e o gatilho das parcelas da operadora recusa reduzir
-- o valor de um pagamento no cartão já pago (o estorno é marcar a linha).
--
-- A função nova é `pacote_cancelar_devolvendo` (a de antes, `pacote_cancelar`,
-- vira um invólucro dela sem a escolha: no Pix segue parcial; no cartão
-- recusa). O corpo parte do ATUAL de produção (pg_get_functiondef de
-- 2026-11-03); o que muda está marcado com "r2-ven-05".

create or replace function public.pacote_cancelar_devolvendo(
  p_tenant uuid, p_pacote uuid, p_ator uuid, p_ator_nome text, p_motivo text, p_destino text,
  p_agendamentos text, p_esperado numeric, p_simular boolean, p_estorno text, p_novo jsonb)
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
  -- r2-ven-05: o pagamento que volta em parte e como estorná-lo.
  v_parcial     jsonb;
  v_estorno     text := nullif(upper(trim(coalesce(p_estorno, ''))), '');
  v_novo_metodo text := nullif(upper(trim(coalesce(p_novo ->> 'metodo', ''))), '');
  v_novo_vezes  int  := coalesce(nullif(p_novo ->> 'vezes', '')::int, 1);
  v_fica        numeric;
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

  -- r2-ven-05: o pagamento que o estorno pega EM PARTE (na mesma ordem do
  -- estorno: do mais novo para o mais antigo), se houver. É ele que pede a
  -- escolha; no cartão, só o inteiro (r2-fin-03).
  if v_devolver > 0 then
    v_resto := v_devolver;
    for v_tx in
      select f.id, f.amount, f.description, f.payment_method, f.cartao_vezes
        from public.financial_transactions f
       where f.client_package_id = p_pacote and f.type = 'INCOME' and f.is_paid
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
    'pacote', coalesce(v_nome, 'Pacote'), 'preco', v_preco, 'sessoes', v_total, 'restantes', v_restantes,
    'valor_restante', v_valor, 'usado', v_usado, 'pago', v_pago, 'a_receber', v_aberto,
    'parcelas', v_parcelas, 'cai', v_cortar, 'devolver', v_devolver,
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
      elsif v_estorno = 'INTEIRO' then
        -- r2-ven-05 (b): estorna o pagamento inteiro (o de sempre) e lança o
        -- que fica — o usado — como um pagamento NOVO, pago agora, na forma
        -- escolhida. No cartão é o único caminho (r2-fin-03): as parcelas da
        -- operadora do pagamento caem juntas pelo gatilho, e as do novo
        -- (se for crédito em N vezes) nascem pelo mesmo gatilho.
        v_fica := round(v_tx.amount - v_resto, 2);
        perform public.estornar_transacao(v_tx.id, p_tenant, v_ator, v_motivo);
        insert into public.financial_transactions (
          branch_id, client_id, client_package_id, type, category, description, amount,
          payment_method, cartao_vezes, is_paid, paid_at, created_by
        ) values (
          v_tx.branch_id, v_tx.client_id, p_pacote, 'INCOME', v_tx.category,
          v_tx.description || ' — o usado, lançado de novo no cancelamento', v_fica,
          v_novo_metodo::public."PaymentMethod",
          case when v_novo_metodo = 'CREDIT_CARD' and v_novo_vezes >= 2 then v_novo_vezes end,
          true, now(), v_ator
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
    'destino',    case when v_devolver > 0 then v_destino end,
    'estorno',    case when v_destino = 'ESTORNO' and v_parcial is not null then v_estorno end);
end $function$;

revoke execute on function public.pacote_cancelar_devolvendo(uuid, uuid, uuid, text, text, text, text, numeric, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.pacote_cancelar_devolvendo(uuid, uuid, uuid, text, text, text, text, numeric, boolean, text, jsonb) to service_role;

-- A de antes: o mesmo cancelamento, sem a escolha (fora do cartão, parcial
-- como sempre; no cartão, recusa).
create or replace function public.pacote_cancelar(p_tenant uuid, p_pacote uuid, p_ator uuid, p_ator_nome text, p_motivo text, p_destino text, p_agendamentos text, p_esperado numeric, p_simular boolean DEFAULT false)
 returns jsonb
 language sql
 security definer
 set search_path to ''
as $function$
  select public.pacote_cancelar_devolvendo(p_tenant, p_pacote, p_ator, p_ator_nome, p_motivo, p_destino,
                                           p_agendamentos, p_esperado, p_simular, null, null)
$function$;

-- r2-fin-03: o pagamento no cartão já pago não diminui — o estorno é do
-- inteiro (marcar a linha 'Estornada'). Sobre o corpo ATUAL do gatilho.
create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

select pg_temp.trocar_no_corpo('private.recebiveis_do_cartao_acompanham()'::regprocedure,
  array[E'begin\n  if not exists (select 1 from public.recebiveis_do_cartao r where r.transaction_id = new.id) then'],
  array[E'begin\n  -- r2-fin-03: no cartão, o estorno é do pagamento inteiro; o já pago não diminui.\n  if tg_op = ''UPDATE'' and old.is_paid and new.is_paid and new.amount < old.amount\n     and coalesce(new.notes, '''') <> ''Estornada'' and coalesce(new.category, '''') <> ''Estorno''\n     and new.type = ''INCOME'' and new.payment_method in (''CREDIT_CARD'', ''DEBIT_CARD'') then\n    raise exception ''No cartão, o estorno é do pagamento inteiro: estorne o pagamento inteiro e lance o usado de novo.'' using errcode = ''P0001'';\n  end if;\n  if not exists (select 1 from public.recebiveis_do_cartao r where r.transaction_id = new.id) then'],
  array[1]);

notify pgrst, 'reload schema';
