-- A comissão do PACOTE, configurável no cadastro de cada pacote (decisão do
-- Heitor, 2026-10-30). Até aqui ela era só por sessão, pela regra de cada
-- profissional. Agora são duas, cada uma ligada ou não:
--
-- * de VENDA, para quem vendeu (`client_packages.sold_by`): percentual sobre o
--   valor VENDIDO (com o desconto) ou valor fixo. A linha
--   (commission_lines.origem = 'PACOTE_VENDA', client_package_id, sem
--   atendimento) nasce em pacote_vender, antes do dinheiro, e é SEMPRE do modo
--   "quando paga": à vista libera na hora, a receber à medida que entra (na
--   proporção do recebido), o estorno devolve. Retrata a taxa da maquininha da
--   rede; não desconta insumos. É o ramo do pacote em comissao_alvo.
-- * de EXECUÇÃO, para quem atende cada sessão: 'REGRA' (a regra do
--   profissional — o de sempre, e o padrão dos pacotes que já existem),
--   'PERCENTAGE' (da parte da sessão no rateio), 'FIXED_AMOUNT' (por sessão)
--   ou 'NENHUMA'. O app monta a linha na conclusão (linhasDoAtendimento) e o
--   "Abater do pacote" a segue. O MODO da rede (no atendimento × quando paga)
--   continua valendo para a execução, como antes.
--
-- O catálogo guarda a configuração (service_packages) e a venda o RETRATO
-- (client_packages): mudar o catálogo vale para as próximas vendas.

-- 1. As colunas ---------------------------------------------------------------
alter table public.service_packages
  add column if not exists comissao_venda_tipo public."CommissionType",
  add column if not exists comissao_venda_valor numeric(12,2),
  add column if not exists comissao_execucao text not null default 'REGRA',
  add column if not exists comissao_execucao_valor numeric(12,2);
alter table public.client_packages
  add column if not exists comissao_venda_tipo public."CommissionType",
  add column if not exists comissao_venda_valor numeric(12,2),
  add column if not exists comissao_execucao text not null default 'REGRA',
  add column if not exists comissao_execucao_valor numeric(12,2);

alter table public.service_packages
  add constraint service_packages_comissao_execucao_check
    check (comissao_execucao in ('REGRA', 'PERCENTAGE', 'FIXED_AMOUNT', 'NENHUMA')),
  add constraint service_packages_comissao_valores_check check (
    (comissao_venda_tipo is null or (comissao_venda_valor is not null and comissao_venda_valor >= 0
      and (comissao_venda_tipo <> 'PERCENTAGE' or comissao_venda_valor <= 100)))
    and (comissao_execucao not in ('PERCENTAGE', 'FIXED_AMOUNT') or (comissao_execucao_valor is not null and comissao_execucao_valor >= 0
      and (comissao_execucao <> 'PERCENTAGE' or comissao_execucao_valor <= 100))));
alter table public.client_packages
  add constraint client_packages_comissao_execucao_check
    check (comissao_execucao in ('REGRA', 'PERCENTAGE', 'FIXED_AMOUNT', 'NENHUMA'));

alter table public.commission_lines drop constraint commission_lines_origem_check;
alter table public.commission_lines
  add constraint commission_lines_origem_check
    check (origem = any (array['AVULSO', 'PLANO', 'PACOTE', 'PACOTE_VENDA', 'PRE_PAGO', 'PRODUTO']));

-- 2. pacote_salvar com a comissão (p_comissao nulo = não mexe) -----------------
drop function if exists public.pacote_salvar(uuid, uuid, text, numeric, integer, boolean, jsonb);
create or replace function public.pacote_salvar(
  p_tenant uuid, p_id uuid, p_nome text, p_preco numeric, p_validade integer, p_ativo boolean, p_itens jsonb,
  p_comissao jsonb default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id     uuid := p_id;
  v_total  int;
  v_prim   uuid;
  v_vtipo  text;
  v_vvalor numeric;
  v_etipo  text;
  v_evalor numeric;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um procedimento ao pacote.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
     where not exists (select 1 from public.procedures p where p.id = (i ->> 'procedure_id')::uuid and p.tenant_id = p_tenant)
  ) then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  select sum((i ->> 'quantity')::int), (array_agg((i ->> 'procedure_id')::uuid order by n))[1]
    into v_total, v_prim
    from jsonb_array_elements(p_itens) with ordinality as t(i, n);
  if v_total < 2 then
    raise exception 'Um pacote tem pelo menos 2 sessões.' using errcode = 'P0001';
  end if;

  if p_comissao is not null then
    v_vtipo  := nullif(p_comissao #>> '{venda,tipo}', '');
    v_vvalor := case when v_vtipo is null then null else round((p_comissao #>> '{venda,valor}')::numeric, 2) end;
    v_etipo  := coalesce(nullif(p_comissao #>> '{execucao,tipo}', ''), 'REGRA');
    v_evalor := case when v_etipo in ('PERCENTAGE', 'FIXED_AMOUNT') then round((p_comissao #>> '{execucao,valor}')::numeric, 2) end;
    if v_vtipo is not null and v_vtipo not in ('PERCENTAGE', 'FIXED_AMOUNT') then
      raise exception 'Comissão de venda inválida.' using errcode = 'P0001';
    end if;
    if v_etipo not in ('REGRA', 'PERCENTAGE', 'FIXED_AMOUNT', 'NENHUMA') then
      raise exception 'Comissão de execução inválida.' using errcode = 'P0001';
    end if;
    if (v_vtipo is not null and (v_vvalor is null or v_vvalor < 0 or (v_vtipo = 'PERCENTAGE' and v_vvalor > 100)))
       or (v_etipo in ('PERCENTAGE', 'FIXED_AMOUNT') and (v_evalor is null or v_evalor < 0 or (v_etipo = 'PERCENTAGE' and v_evalor > 100))) then
      raise exception 'Valor de comissão inválido (o percentual vai de 0 a 100).' using errcode = 'P0001';
    end if;
  end if;

  if v_id is null then
    insert into public.service_packages (tenant_id, branch_id, procedure_id, name, total_sessions, price, validity_days, is_active,
      comissao_venda_tipo, comissao_venda_valor, comissao_execucao, comissao_execucao_valor)
    values (p_tenant, null, v_prim, trim(p_nome), v_total, round(p_preco, 2), p_validade, p_ativo,
      v_vtipo::public."CommissionType", v_vvalor, coalesce(v_etipo, 'REGRA'), v_evalor)
    returning id into v_id;
  else
    update public.service_packages
       set procedure_id = v_prim, name = trim(p_nome), total_sessions = v_total, price = round(p_preco, 2),
           validity_days = p_validade, is_active = p_ativo,
           comissao_venda_tipo     = case when p_comissao is null then comissao_venda_tipo else v_vtipo::public."CommissionType" end,
           comissao_venda_valor    = case when p_comissao is null then comissao_venda_valor else v_vvalor end,
           comissao_execucao       = case when p_comissao is null then comissao_execucao else v_etipo end,
           comissao_execucao_valor = case when p_comissao is null then comissao_execucao_valor else v_evalor end
     where id = v_id and tenant_id = p_tenant;
    if not found then
      raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
    end if;
    delete from public.service_package_items where package_id = v_id;
  end if;

  insert into public.service_package_items (tenant_id, package_id, procedure_id, quantity, sort_order)
  select p_tenant, v_id, (i ->> 'procedure_id')::uuid, (i ->> 'quantity')::int, n::int - 1
    from jsonb_array_elements(p_itens) with ordinality as t(i, n);

  return v_id;
end $function$;
revoke execute on function public.pacote_salvar(uuid, uuid, text, numeric, integer, boolean, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pacote_salvar(uuid, uuid, text, numeric, integer, boolean, jsonb, jsonb) to service_role;

-- 3. pacote_vender: o retrato da comissão e a linha da VENDA ------------------
create or replace function public.pacote_vender(p_tenant uuid, p_cliente uuid, p_pacote uuid, p_unidade uuid, p_ator uuid, p_lancamentos jsonb, p_sessoes jsonb DEFAULT NULL::jsonb, p_desconto numeric DEFAULT 0)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_pac      public.service_packages%rowtype;
  v_nome     text;
  v_cp       uuid;
  v_soma     numeric;
  v_l        jsonb;
  v_tx       uuid;
  v_agora    timestamptz := now();
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido  numeric;
  v_cfg      public.commission_configs%rowtype;
begin
  select * into v_pac from public.service_packages sp where sp.id = p_pacote and sp.tenant_id = p_tenant;
  if not found then
    raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
  end if;
  if not v_pac.is_active then
    raise exception 'Este pacote está desativado.' using errcode = 'P0001';
  end if;
  if v_pac.branch_id is not null and v_pac.branch_id <> p_unidade then
    raise exception 'Este pacote é de outra unidade.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select c.name into v_nome from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_desconto < 0 or v_desconto > round(v_pac.price, 2) then
    raise exception 'O desconto não pode ser maior que o preço do pacote.' using errcode = 'P0001';
  end if;
  v_vendido := round(v_pac.price, 2) - v_desconto;

  select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) into v_soma
    from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l;
  if v_soma <> v_vendido then
    raise exception 'O pagamento não fecha com o preço do pacote.' using errcode = 'P0001';
  end if;

  if p_sessoes is not null then
    if exists (
      select 1 from (
        select i.procedure_id, sum(i.quantity) quantity from public.service_package_items i where i.package_id = p_pacote group by 1
      ) itens
      full join (
        select (s ->> 'procedure_id')::uuid procedure_id, count(*) n from jsonb_array_elements(p_sessoes) s group by 1
      ) sess on sess.procedure_id = itens.procedure_id
       where coalesce(itens.quantity, 0) <> coalesce(sess.n, 0)
    ) then
      raise exception 'As sessões não batem com os procedimentos do pacote.' using errcode = 'P0001';
    end if;
    if (select coalesce(sum(round((s ->> 'preco')::numeric, 2)), 0) from jsonb_array_elements(p_sessoes) s) <> v_vendido then
      raise exception 'O rateio das sessões não fecha com o preço do pacote.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.client_packages
    (client_id, package_id, branch_id, purchased_at, expires_at, total_sessions, used_sessions,
     price, preco_tabela, desconto, sold_by,
     comissao_venda_tipo, comissao_venda_valor, comissao_execucao, comissao_execucao_valor)
  values (
    p_cliente, p_pacote, p_unidade, v_agora,
    case when v_pac.validity_days is null then null else v_agora + make_interval(days => v_pac.validity_days) end,
    v_pac.total_sessions, 0, v_vendido, round(v_pac.price, 2), v_desconto, p_ator,
    v_pac.comissao_venda_tipo, v_pac.comissao_venda_valor, v_pac.comissao_execucao, v_pac.comissao_execucao_valor
  ) returning id into v_cp;

  if p_sessoes is not null then
    insert into public.package_sessions (client_package_id, status, session_number, procedure_id, preco)
    select v_cp, 'AVAILABLE', n::int, (s ->> 'procedure_id')::uuid, round((s ->> 'preco')::numeric, 2)
      from jsonb_array_elements(p_sessoes) with ordinality as t(s, n);
  else
    insert into public.package_sessions (client_package_id, status, session_number, procedure_id)
    select v_cp, 'AVAILABLE', row_number() over (order by i.sort_order, g)::int, i.procedure_id
      from public.service_package_items i
      cross join lateral generate_series(1, i.quantity) g
     where i.package_id = p_pacote;
  end if;

  -- A comissão de VENDA, para quem vendeu: a linha nasce ANTES do dinheiro — o
  -- gatilho do lançamento já a acerta (à vista, na hora; a receber, ao entrar).
  if p_ator is not null and v_pac.comissao_venda_tipo is not null and coalesce(v_pac.comissao_venda_valor, 0) > 0 then
    select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, client_package_id)
    values (p_tenant, p_unidade, null, 0, null, p_ator, 'PACOTE_VENDA',
            v_pac.comissao_venda_tipo, v_pac.comissao_venda_valor, 'PAGAMENTO', false, coalesce(v_cfg.desconta_taxa, false),
            'PRECO', v_vendido, 0, v_cp);
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb))
  loop
    insert into public.financial_transactions
      (branch_id, client_id, client_package_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes)
    values (
      p_unidade, p_cliente, v_cp, 'INCOME', 'Serviços', 'Pacote — ' || v_pac.name || coalesce(' — ' || nullif(v_l ->> 'sufixo', ''), ''),
      round((v_l ->> 'amount')::numeric, 2),
      nullif(v_l ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l ->> 'is_paid')::boolean, false),
      case when coalesce((v_l ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l ->> 'due_date', '')::timestamptz,
      nullif(v_l ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema'),
      nullif(v_l ->> 'parcela_numero', '')::int,
      nullif(v_l ->> 'parcela_total', '')::int,
      nullif(v_l ->> 'parcela_grupo', '')::uuid,
      nullif(v_l ->> 'cartao_vezes', '')::smallint
    ) returning id into v_tx;

    if jsonb_typeof(v_l -> 'parcelas') = 'array' then
      insert into public.installments (transaction_id, number, total, amount, due_date, is_paid)
      select v_tx, (p ->> 'number')::int, (p ->> 'total')::int, round((p ->> 'amount')::numeric, 2),
             (p ->> 'due_date')::timestamptz, false
        from jsonb_array_elements(v_l -> 'parcelas') p;
    end if;
  end loop;

  return v_cp;
end $function$;

-- 4. comissao_alvo: a linha da VENDA do pacote é o ramo do pacote --------------
create or replace function private.comissao_alvo(p_linha uuid)
 returns numeric
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
  v_dvenda    numeric := 0;
begin
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return 0;
  end if;

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
    v_fracao := case
      when v_l.modo = 'PAGAMENTO' then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
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
      select cp.price into v_total from public.client_packages cp where cp.id = v_l.client_package_id;
    elsif v_l.origem = 'PRODUTO' then
      select ps.price into v_total from public.product_sales ps where ps.id = v_l.product_sale_id;
    else
      select ps.price - coalesce((select sum(u.preco) from public.procedure_sale_units u
                                   where u.sale_id = ps.id and u.status = 'CANCELADA'), 0)
        into v_total
        from public.procedure_sales ps where ps.id = v_l.procedure_sale_id;
    end if;
    select coalesce(sum(f.amount), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce(f.cartao_vezes, f.parcela_total, (select max(i.total) from public.installments i where i.transaction_id = f.id), 1)))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_taxa
      from public.financial_transactions f
     where ((v_l.origem = 'PLANO' and f.treatment_plan_id = v_l.treatment_plan_id)
         or (v_l.origem in ('PACOTE', 'PACOTE_VENDA') and f.client_package_id = v_l.client_package_id)
         or (v_l.origem = 'PRE_PAGO' and f.procedure_sale_id = v_l.procedure_sale_id)
         or (v_l.origem = 'PRODUTO' and f.product_sale_id = v_l.product_sale_id))
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    if v_l.modo = 'PAGAMENTO' and v_total is not null then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
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

  return round(v_valor * v_fracao, 2);
end $function$;

-- 5. O evento da liberação aponta a venda do pacote quando não há atendimento --
create or replace function private.comissao_acertar_linha(p_linha uuid, p_motivo text, p_transacao uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_l       public.commission_lines%rowtype;
  v_alvo    numeric;
  v_lancado numeric;
  v_delta   numeric;
  v_id      uuid;
begin
  perform pg_advisory_xact_lock(hashtext('comissao:' || p_linha::text));
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found then
    return 0;
  end if;
  v_alvo := private.comissao_alvo(p_linha);
  select coalesce(sum(c.amount), 0) into v_lancado from public.commissions c where c.line_id = p_linha;
  v_delta := round(v_alvo - v_lancado, 2);
  if v_delta <> 0 then
    insert into public.commissions
      (branch_id, professional_id, appointment_id, amount, type, rule_value, period_ref, status,
       line_id, kind, motivo, released_at, transaction_id)
    values (
      v_l.branch_id, v_l.professional_id, v_l.appointment_id, v_delta, v_l.regra_tipo, v_l.regra_valor,
      to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'), 'OPEN',
      p_linha,
      case when v_delta > 0 then 'LIBERACAO'
           when p_motivo ilike 'estorno%' then 'ESTORNO'
           else 'AJUSTE' end,
      p_motivo, now(), p_transacao
    )
    returning id into v_id;

    if v_delta > 0 and p_transacao is not null then
      insert into public.domain_events
        (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
      values (
        v_l.tenant_id, v_l.branch_id, 'comissao.liberada', 'comissao',
        coalesce(v_l.appointment_id, v_l.product_sale_id, v_l.client_package_id),
        jsonb_build_object(
          'profissionalId',   v_l.professional_id,
          'profissionalNome', (select u.name from public.users u where u.id = v_l.professional_id),
          'agendamentoId',    v_l.appointment_id,
          'vendaDeProdutoId', v_l.product_sale_id,
          'pacoteId',         case when v_l.origem = 'PACOTE_VENDA' then v_l.client_package_id end,
          'procedimentoNome', coalesce(
            (select p.name from public.procedures p where p.id = v_l.procedure_id),
            (select pr.name from public.product_sales ps join public.products pr on pr.id = ps.product_id where ps.id = v_l.product_sale_id),
            (select 'Venda do pacote ' || sp.name from public.client_packages cp join public.service_packages sp on sp.id = cp.package_id
              where cp.id = v_l.client_package_id and v_l.origem = 'PACOTE_VENDA')),
          'valor',            v_delta,
          'motivo',           p_motivo
        ),
        'sistema', 'banco', 'comissao.liberada:' || v_id, now()
      )
      on conflict (tenant_id, chave) where chave is not null do nothing;
    end if;
  end if;
  return v_delta;
end $function$;

-- 6. O extrato diz o PACOTE (a venda e a sessão) ------------------------------
drop function if exists public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid);
create function public.comissoes_extrato(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
 returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric, pacote text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select c.id, c.professional_id, c.branch_id, c.released_at, c.kind, c.motivo,
         c.amount, c.status::text, c.payout_id, c.appointment_id, coalesce(a.scheduled_at, ps.sold_at, cp.purchased_at),
         coalesce(cli.name, cps.name, ccp.name), coalesce(pr.name, prod.name, sp.name), l.origem, l.preco, l.regra_tipo::text, l.regra_valor,
         sp.name
    from public.commissions c
    join public.branches b on b.id = c.branch_id
    left join public.commission_lines l on l.id = c.line_id
    left join public.appointments a on a.id = c.appointment_id
    left join public.clients cli on cli.id = a.client_id
    left join public.procedures pr on pr.id = coalesce(l.procedure_id, a.procedure_id)
    left join public.product_sales ps on ps.id = l.product_sale_id
    left join public.clients cps on cps.id = ps.client_id
    left join public.products prod on prod.id = ps.product_id
    left join public.client_packages cp on cp.id = l.client_package_id
    left join public.service_packages sp on sp.id = cp.package_id
    left join public.clients ccp on ccp.id = cp.client_id
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
     and (p_profissional is null or c.professional_id = p_profissional)
     and (c.released_at between p_inicio and p_fim
          or (c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim))
   order by c.released_at desc, c.id
$function$;
revoke execute on function public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.comissoes_extrato(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

-- 7. "Abater do pacote" segue a execução do pacote -----------------------------
create or replace function public.atendimento_abater_do_pacote(p_agendamento uuid, p_sessao uuid, p_tenant uuid, p_ator uuid, p_ator_nome text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ap        record;
  v_s         record;
  v_proc_s    uuid;
  v_preco     numeric;
  v_soma      numeric;
  v_linha     public.commission_lines%rowtype;
  v_primeira  public.commission_lines%rowtype;
  v_cfg       public.commission_configs%rowtype;
  v_item      int;
  v_nova      uuid;
  v_custo     numeric;
begin
  select a.id, a.status::text as status, a.branch_id, a.client_id, a.procedure_id, a.price, a.treatment_plan_id,
         a.professional_id, b.tenant_id
    into v_ap
    from public.appointments a
    join public.branches b on b.id = a.branch_id
   where a.id = p_agendamento
   for update of a;
  if not found or v_ap.tenant_id is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_ap.status <> 'COMPLETED' then
    raise exception 'Só o atendimento concluído se abate do pacote.' using errcode = 'P0001';
  end if;
  if v_ap.treatment_plan_id is not null then
    raise exception 'Sessão de plano de tratamento: já é paga no plano.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.package_sessions ps where ps.appointment_id = p_agendamento) then
    raise exception 'Este atendimento já é uma sessão de pacote.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.procedure_sale_units u where u.appointment_id = p_agendamento and u.status <> 'CANCELADA') then
    raise exception 'Procedimento pré-pago: já foi pago na venda.' using errcode = 'P0001';
  end if;
  if coalesce(v_ap.price, 0) <= 0 then
    raise exception 'Atendimento sem cobrança: não há o que abater.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.financial_transactions f
              where f.appointment_id = p_agendamento and f.type = 'INCOME' and f.is_paid
                and coalesce(f.notes, '') <> 'Estornada') then
    raise exception 'Pagamento já registrado para este atendimento.' using errcode = 'P0001';
  end if;

  select s.id, s.status::text as status, s.appointment_id, s.procedure_id, s.preco, s.session_number,
         cp.id as pacote, cp.client_id, cp.expires_at, cp.price as pacote_preco, cp.total_sessions,
         cp.comissao_execucao, cp.comissao_execucao_valor,
         sp.procedure_id as proc_do_pacote, sp.name as pacote_nome, b.tenant_id
    into v_s
    from public.package_sessions s
    join public.client_packages cp on cp.id = s.client_package_id
    join public.branches b on b.id = cp.branch_id
    left join public.service_packages sp on sp.id = cp.package_id
   where s.id = p_sessao
   for update of s, cp;
  if not found or v_s.tenant_id is distinct from p_tenant or v_s.client_id is distinct from v_ap.client_id then
    raise exception 'Sessão de pacote não encontrada para esta cliente.' using errcode = 'no_data_found';
  end if;
  if v_s.status <> 'AVAILABLE' or v_s.appointment_id is not null then
    raise exception 'Esta sessão já foi usada ou agendada.' using errcode = 'P0001';
  end if;
  if v_s.expires_at is not null and v_s.expires_at < now() then
    raise exception 'Este pacote venceu.' using errcode = 'P0001';
  end if;
  v_proc_s := coalesce(v_s.procedure_id, v_s.proc_do_pacote);
  if v_proc_s is distinct from v_ap.procedure_id then
    raise exception 'A sessão do pacote é de outro procedimento.' using errcode = 'P0001';
  end if;
  v_preco := coalesce(v_s.preco, round(coalesce(v_s.pacote_preco, 0) / greatest(v_s.total_sessions, 1), 2));

  update public.package_sessions
     set appointment_id = p_agendamento, status = 'USED', used_at = now()
   where id = p_sessao;
  update public.client_packages set used_sessions = used_sessions + 1 where id = v_s.pacote;
  update public.appointments set price = v_preco, updated_at = now() where id = p_agendamento;

  update public.financial_transactions
     set amount = 0, notes = 'Substituído pela sessão do pacote', updated_at = now()
   where appointment_id = p_agendamento and type = 'INCOME' and not is_paid
     and coalesce(notes, '') <> 'Estornada';

  select coalesce(max(cl.item), -1) + 1 into v_item
    from public.commission_lines cl where cl.appointment_id = p_agendamento;
  select coalesce(sum(cl.preco), 0) into v_soma
    from public.commission_lines cl
   where cl.appointment_id = p_agendamento and cl.status <> 'CANCELADA' and cl.origem = 'AVULSO';

  if coalesce(v_s.comissao_execucao, 'REGRA') = 'REGRA' then
    -- A regra do profissional (a de sempre): a linha avulsa vira a de pacote, com a mesma regra.
    for v_linha in
      select * from public.commission_lines cl
       where cl.appointment_id = p_agendamento and cl.status <> 'CANCELADA' and cl.origem = 'AVULSO'
       order by cl.item
    loop
      update public.commission_lines set status = 'CANCELADA' where id = v_linha.id;
      perform private.comissao_acertar_linha(v_linha.id, 'Atendimento abatido do pacote', null);
      insert into public.commission_lines
        (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
         client_package_id, procedure_sale_id, regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa,
         base_com_pontos, preco, custo_insumos)
      values (
        v_linha.tenant_id, v_linha.branch_id, p_agendamento, v_item, v_linha.procedure_id, v_linha.professional_id,
        'PACOTE', null, v_s.pacote, null, v_linha.regra_tipo, v_linha.regra_valor, v_linha.modo,
        v_linha.desconta_insumos, v_linha.desconta_taxa, v_linha.base_com_pontos,
        case when v_soma > 0 then round(v_preco * v_linha.preco / v_soma, 2) else v_preco end,
        v_linha.custo_insumos
      )
      returning id into v_nova;
      perform private.comissao_acertar_linha(v_nova, 'Sessão do pacote', null);
      v_item := v_item + 1;
    end loop;
  else
    -- O pacote diz a execução: a linha avulsa sai, e entra UMA linha com a do
    -- pacote (ou nenhuma). O retrato da configuração é o da linha avulsa, se
    -- havia; senão, o de agora.
    select * into v_primeira from public.commission_lines cl
     where cl.appointment_id = p_agendamento and cl.status <> 'CANCELADA' and cl.origem = 'AVULSO'
     order by cl.item limit 1;
    for v_linha in
      select * from public.commission_lines cl
       where cl.appointment_id = p_agendamento and cl.status <> 'CANCELADA' and cl.origem = 'AVULSO'
       order by cl.item
    loop
      update public.commission_lines set status = 'CANCELADA' where id = v_linha.id;
      perform private.comissao_acertar_linha(v_linha.id, 'Atendimento abatido do pacote', null);
    end loop;
    if v_s.comissao_execucao in ('PERCENTAGE', 'FIXED_AMOUNT') and v_ap.professional_id is not null then
      if v_primeira.id is null then
        select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
        if not found then
          v_cfg.modo := 'ATENDIMENTO'; v_cfg.desconta_insumos := false; v_cfg.desconta_taxa := false;
          v_cfg.base_com_pontos := 'PRECO';
        end if;
        select coalesce(sum(public.custo_do_movimento(m, p)), 0) into v_custo
          from public.stock_movements m
          left join public.products p on p.id = m.product_id
         where m.appointment_id = p_agendamento and m.type = 'PROCEDURE_USAGE';
      else
        v_cfg.modo := v_primeira.modo; v_cfg.desconta_insumos := v_primeira.desconta_insumos;
        v_cfg.desconta_taxa := v_primeira.desconta_taxa; v_cfg.base_com_pontos := v_primeira.base_com_pontos;
        select coalesce(sum(cl.custo_insumos), 0) into v_custo
          from public.commission_lines cl where cl.appointment_id = p_agendamento and cl.origem = 'AVULSO';
      end if;
      insert into public.commission_lines
        (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
         client_package_id, procedure_sale_id, regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa,
         base_com_pontos, preco, custo_insumos)
      values (
        p_tenant, v_ap.branch_id, p_agendamento, v_item, v_ap.procedure_id, v_ap.professional_id,
        'PACOTE', null, v_s.pacote, null, v_s.comissao_execucao::public."CommissionType", v_s.comissao_execucao_valor,
        v_cfg.modo, v_cfg.desconta_insumos, v_cfg.desconta_taxa, v_cfg.base_com_pontos, v_preco, v_custo
      )
      returning id into v_nova;
      perform private.comissao_acertar_linha(v_nova, 'Sessão do pacote', null);
    end if;
  end if;

  if p_ator is not null then
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (
      p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'PACKAGE_SESSION',
      'Abatido do pacote "' || coalesce(v_s.pacote_nome, 'Pacote') || '" (sessão ' || v_s.session_number
        || ' de ' || v_s.total_sessions || ') — sem cobrança'
    );
  end if;

  return jsonb_build_object('pacote', v_s.pacote, 'sessao', p_sessao, 'preco', v_preco);
end
$function$;

notify pgrst, 'reload schema';
