-- D4 (decisão do Heitor, 2026-10-29): "a comissão de venda de produto é
-- configurável pela clínica" — no padrão das configurações de comissão
-- (Configurações → Comissões, a rede, financial: MANAGE).
--
-- 1. commission_configs.produto_pct: o percentual sobre o VENDIDO (preço −
--    desconto) para QUEM VENDEU (`product_sales.sold_by`, a pessoa que
--    registrou a venda — como o pacote e o pré-pago). Nulo/0 = sem comissão.
-- 2. A linha de comissão da venda (commission_lines.origem = 'PRODUTO',
--    product_sale_id), sem atendimento: appointment_id (e o do extrato,
--    commissions.appointment_id) passam a aceitar nulo. A linha é do modo
--    "quando paga" SEMPRE (libera na proporção do que a venda recebeu: à vista
--    na hora, a receber quando entrar, o estorno devolve) — produto não tem
--    "concluir". Retrata a taxa da maquininha da rede; não desconta insumos
--    (o produto vendido não é insumo).
-- 3. A conta continua UMA, no banco: comissao_alvo ganha a origem PRODUTO (o
--    total é o vendido; o recebido, os lançamentos da venda) e o gatilho do
--    pagamento acerta as linhas da venda. O evento comissao.liberada aponta a
--    venda quando não há atendimento.
-- 4. O extrato (comissoes_extrato) diz a cliente e o PRODUTO da linha da venda.
-- 5. produto_vender cria a linha antes do dinheiro (o gatilho do lançamento
--    já a acerta).

-- 1 ---------------------------------------------------------------------------
alter table public.commission_configs
  add column if not exists produto_pct numeric(5,2);
alter table public.commission_configs
  add constraint commission_configs_produto_pct_check check (produto_pct is null or (produto_pct >= 0 and produto_pct <= 100));

-- 2 ---------------------------------------------------------------------------
alter table public.commission_lines
  add column if not exists product_sale_id uuid references public.product_sales(id) on delete set null;
alter table public.commission_lines alter column appointment_id drop not null;
alter table public.commissions alter column appointment_id drop not null;
create index if not exists idx_commission_lines_produto on public.commission_lines (product_sale_id) where product_sale_id is not null;
alter table public.commission_lines drop constraint commission_lines_origem_check;
alter table public.commission_lines
  add constraint commission_lines_origem_check check (origem = any (array['AVULSO', 'PLANO', 'PACOTE', 'PRE_PAGO', 'PRODUTO']));

-- 3 ---------------------------------------------------------------------------
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

  elsif v_l.origem = 'PLANO' or (v_l.origem = 'PACOTE' and v_l.client_package_id is not null)
        or (v_l.origem = 'PRE_PAGO' and v_l.procedure_sale_id is not null)
        or (v_l.origem = 'PRODUTO' and v_l.product_sale_id is not null) then
    if v_l.origem = 'PLANO' then
      select coalesce(sum(p.price), 0) into v_total
        from public.treatment_plan_sessions s
        join public.treatment_plan_session_procedures p on p.session_id = s.id
       where s.plan_id = v_l.treatment_plan_id;
    elsif v_l.origem = 'PACOTE' then
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
         or (v_l.origem = 'PACOTE' and f.client_package_id = v_l.client_package_id)
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

create or replace function private.comissoes_do_pagamento()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_motivo text;
  v_linha  uuid;
begin
  if new.appointment_id is null and new.treatment_plan_id is null and new.client_package_id is null
     and new.procedure_sale_id is null and new.product_sale_id is null then
    return new;
  end if;
  v_motivo := case
    when tg_op = 'UPDATE' and coalesce(new.notes, '') = 'Estornada' and coalesce(old.notes, '') <> 'Estornada'
      then 'Estorno do pagamento'
    when new.treatment_plan_id is not null then 'Recebimento do plano'
    when new.client_package_id is not null then 'Recebimento do pacote'
    when new.procedure_sale_id is not null then 'Recebimento do pré-pago'
    when new.product_sale_id is not null then 'Recebimento da venda de produto'
    else 'Pagamento recebido'
  end;
  for v_linha in
    select cl.id from public.commission_lines cl
     where (new.appointment_id is not null and cl.appointment_id = new.appointment_id)
        or (new.treatment_plan_id is not null and cl.treatment_plan_id = new.treatment_plan_id)
        or (new.client_package_id is not null and cl.client_package_id = new.client_package_id)
        or (new.procedure_sale_id is not null and cl.procedure_sale_id = new.procedure_sale_id)
        or (new.product_sale_id is not null and cl.product_sale_id = new.product_sale_id)
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, v_motivo, new.id);
  end loop;
  return new;
end $function$;

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
        v_l.tenant_id, v_l.branch_id, 'comissao.liberada', 'comissao', coalesce(v_l.appointment_id, v_l.product_sale_id),
        jsonb_build_object(
          'profissionalId',   v_l.professional_id,
          'profissionalNome', (select u.name from public.users u where u.id = v_l.professional_id),
          'agendamentoId',    v_l.appointment_id,
          'vendaDeProdutoId', v_l.product_sale_id,
          'procedimentoNome', coalesce(
            (select p.name from public.procedures p where p.id = v_l.procedure_id),
            (select pr.name from public.product_sales ps join public.products pr on pr.id = ps.product_id where ps.id = v_l.product_sale_id)),
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

-- 4 ---------------------------------------------------------------------------
create or replace function public.comissoes_extrato(p_tenant uuid, p_branch_ids uuid[], p_inicio timestamp with time zone, p_fim timestamp with time zone, p_profissional uuid)
 returns table(id uuid, professional_id uuid, branch_id uuid, released_at timestamp with time zone, kind text, motivo text, amount numeric, status text, payout_id uuid, appointment_id uuid, scheduled_at timestamp with time zone, cliente text, procedimento text, origem text, preco numeric, regra_tipo text, regra_valor numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select c.id, c.professional_id, c.branch_id, c.released_at, c.kind, c.motivo,
         c.amount, c.status::text, c.payout_id, c.appointment_id, coalesce(a.scheduled_at, ps.sold_at),
         coalesce(cli.name, cps.name), coalesce(pr.name, prod.name), l.origem, l.preco, l.regra_tipo::text, l.regra_valor
    from public.commissions c
    join public.branches b on b.id = c.branch_id
    left join public.commission_lines l on l.id = c.line_id
    left join public.appointments a on a.id = c.appointment_id
    left join public.clients cli on cli.id = a.client_id
    left join public.procedures pr on pr.id = coalesce(l.procedure_id, a.procedure_id)
    left join public.product_sales ps on ps.id = l.product_sale_id
    left join public.clients cps on cps.id = ps.client_id
    left join public.products prod on prod.id = ps.product_id
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
     and (p_profissional is null or c.professional_id = p_profissional)
     and (c.released_at between p_inicio and p_fim
          or (c.status = 'OPEN' and c.payout_id is null and c.released_at <= p_fim))
   order by c.released_at desc, c.id
$function$;

-- 5: produto_vender com a linha de comissão ------------------------------------
create or replace function public.produto_vender(
  p_tenant uuid, p_cliente uuid, p_produto uuid, p_unidade uuid, p_ator uuid,
  p_quantidade integer, p_desconto numeric, p_lancamentos jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p          public.products%rowtype;
  v_cliente    text;
  v_upp        numeric;
  v_fator      numeric;
  v_saldo      numeric;
  v_rend       numeric;
  v_disponivel numeric;
  v_unit       numeric;
  v_tabela     numeric;
  v_desconto   numeric := round(coalesce(p_desconto, 0), 2);
  v_vendido    numeric;
  v_falta      numeric;
  v_tira       numeric;
  v_soma       numeric := 0;
  v_peso       numeric := 0;
  v_custo_un   numeric;
  v_l          record;
  v_novo_rend  numeric;
  v_novas      numeric;
  v_venda      uuid;
  v_mov        uuid;
  v_cfg        public.commission_configs%rowtype;
  v_agora      timestamptz := now();
begin
  select * into v_p from public.products p where p.id = p_produto and p.tenant_id = p_tenant;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not coalesce(v_p.is_active, true) then
    raise exception 'Este produto está desativado.' using errcode = 'P0001';
  end if;
  if v_p.uso not in ('REVENDA', 'AMBOS') or v_p.sale_price is null or v_p.sale_price <= 0 then
    raise exception 'Este produto não é de revenda: marque o uso e o preço de venda no cadastro.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;
  select c.name into v_cliente from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Cliente não encontrada: a venda de produto é para uma cliente cadastrada.' using errcode = 'no_data_found';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then
    raise exception 'Quantidade inválida (de 1 a 100).' using errcode = 'P0001';
  end if;

  v_unit   := round(v_p.sale_price, 2);
  v_tabela := v_unit * p_quantidade;
  if v_desconto < 0 or v_desconto > v_tabela then
    raise exception 'O desconto não pode ser maior que o valor da venda.' using errcode = 'P0001';
  end if;
  v_vendido := v_tabela - v_desconto;
  if (select coalesce(sum(round((l ->> 'amount')::numeric, 2)), 0) from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) l) <> v_vendido then
    raise exception 'O pagamento não fecha com o valor da venda.' using errcode = 'P0001';
  end if;

  v_upp   := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  v_fator := public.fator_de_consumo(v_p);
  select s.current_stock, s.current_rendimento into v_saldo, v_rend
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = p_unidade
   for update;
  if v_upp is not null then
    v_rend       := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
    v_disponivel := floor(round(greatest(v_rend, 0) / v_upp, 6));
  else
    v_disponivel := floor(greatest(coalesce(v_saldo, 0), 0));
  end if;
  if p_quantidade > v_disponivel then
    raise exception 'Estoque insuficiente: há % % de % nesta unidade.',
      trim_scale(v_disponivel), v_p.unit, v_p.name using errcode = 'P0001';
  end if;

  v_falta := p_quantidade;
  for v_l in
    select b.id, b.quantity,
           (select m.unit_cost from public.stock_movement_batches smb
              join public.stock_movements m on m.id = smb.movement_id
             where smb.batch_id = b.id and m.type = 'PURCHASE' and m.unit_cost is not null limit 1) as custo
      from public.product_batches b
     where b.product_id = p_produto and b.branch_id = p_unidade and b.quantity > 0
     order by coalesce(b.expires_at < current_date, false), b.expires_at nulls last, b.received_at
  loop
    exit when v_falta <= 0;
    v_tira := least(v_l.quantity, v_falta);
    if v_l.custo is not null then
      v_soma := v_soma + v_tira * v_l.custo;
      v_peso := v_peso + v_tira;
    end if;
    v_falta := v_falta - v_tira;
  end loop;
  v_custo_un := case when v_peso > 0 then v_soma / v_peso else public.custo_de_consumo(v_p) end;

  insert into public.product_sales
    (tenant_id, branch_id, client_id, product_id, quantity, preco_unitario, preco_tabela, desconto, price,
     custo, sold_by, sold_at)
  values (p_tenant, p_unidade, p_cliente, p_produto, p_quantidade, v_unit, v_tabela, v_desconto, v_vendido,
          round(coalesce(v_custo_un, 0) * p_quantidade * v_fator, 2), p_ator, v_agora)
  returning id into v_venda;

  if v_upp is not null then
    v_novo_rend := v_rend - p_quantidade * v_upp;
    v_novas     := ceil(round(v_novo_rend / v_upp, 6));
  else
    v_novas     := coalesce(v_saldo, 0) - p_quantidade;
    v_novo_rend := null;
  end if;

  insert into public.stock_movements
    (branch_id, product_id, type, quantity, balance_after, unit_cost, notes, created_by, reference)
  values (p_unidade, p_produto, 'SALE', -(p_quantidade * v_fator), coalesce(v_novo_rend, v_novas), v_custo_un,
          'Venda — ' || v_cliente, coalesce(p_ator::text, 'sistema'), 'venda:' || v_venda)
  returning id into v_mov;

  update public.branch_product_stock
     set current_stock = v_novas, current_rendimento = v_novo_rend, updated_at = now()
   where product_id = p_produto and branch_id = p_unidade;

  update public.product_sales set stock_movement_id = v_mov where id = v_venda;

  -- A comissão de quem vendeu (D4): se a rede configurou. A linha nasce ANTES
  -- do dinheiro — o gatilho do lançamento já a acerta (à vista, na hora).
  select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
  if p_ator is not null and coalesce(v_cfg.produto_pct, 0) > 0 then
    insert into public.commission_lines
      (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem,
       regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos, product_sale_id)
    values (p_tenant, p_unidade, null, 0, null, p_ator, 'PRODUTO',
            'PERCENTAGE', v_cfg.produto_pct, 'PAGAMENTO', false, coalesce(v_cfg.desconta_taxa, false), 'PRECO', v_vendido, 0, v_venda);
  end if;

  for v_l in select * from jsonb_array_elements(coalesce(p_lancamentos, '[]'::jsonb)) as x(j)
  loop
    insert into public.financial_transactions
      (branch_id, client_id, product_sale_id, type, category, description, amount, payment_method,
       is_paid, paid_at, due_date, notes, created_by, parcela_numero, parcela_total, parcela_grupo, cartao_vezes)
    values (
      p_unidade, p_cliente, v_venda, 'INCOME', 'Venda de produto',
      'Venda de produto — ' || p_quantidade || '× ' || v_p.name || coalesce(' — ' || nullif(v_l.j ->> 'sufixo', ''), ''),
      round((v_l.j ->> 'amount')::numeric, 2),
      nullif(v_l.j ->> 'payment_method', '')::public."PaymentMethod",
      coalesce((v_l.j ->> 'is_paid')::boolean, false),
      case when coalesce((v_l.j ->> 'is_paid')::boolean, false) then v_agora else null end,
      nullif(v_l.j ->> 'due_date', '')::timestamptz,
      nullif(v_l.j ->> 'notes', ''),
      coalesce(p_ator::text, 'sistema'),
      nullif(v_l.j ->> 'parcela_numero', '')::int,
      nullif(v_l.j ->> 'parcela_total', '')::int,
      nullif(v_l.j ->> 'parcela_grupo', '')::uuid,
      nullif(v_l.j ->> 'cartao_vezes', '')::smallint
    );
  end loop;

  return v_venda;
end;
$function$;

notify pgrst, 'reload schema';
