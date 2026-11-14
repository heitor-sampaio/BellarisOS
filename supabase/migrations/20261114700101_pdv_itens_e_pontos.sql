-- O PDV, fase 5b (o plano de adaptação, docs/revisao.md — PDV2 e FD2a–FD2c).
--
-- 1. Vários itens numa comanda: o produto de Venda direta se ACRESCENTA na
--    comanda do atendimento (`comanda_itens`) e só sai do estoque quando a
--    comanda é paga — junto do atendimento, com a mesma forma, numa transação
--    só (`confirmar_pagamento_do_atendimento`, que chama a MESMA venda de
--    produto da "Nova venda": `produto_vender_itens`). A venda do produto é
--    DESTA comanda: não abre a comanda VENDA (`bellaris.venda_na_comanda`).
-- 2. FD2a/FD2b: os pontos e o voucher valem sobre o TOTAL da comanda (o
--    atendimento e os produtos); o desconto se divide pelo peso de cada um, e
--    o resgate também (um por lançamento: o estorno de um devolve só a parte
--    dele). Na "Nova venda" (produto, pacote, pré-pago), à vista, por
--    `venda_com_fidelidade`, que chama a venda de sempre e aplica os pontos
--    e o voucher no MESMO lançamento, antes de ele ficar pago — o ponto
--    ganho nasce do que foi pago em dinheiro.
--
-- Nada aqui é destrutivo: uma tabela nova, funções novas e três substituídas
-- com a mesma assinatura (confirmar_pagamento_do_atendimento, pdv_comandas,
-- private.comanda_da_venda).

-- ---------------------------------------------------------------------------
-- A tabela: o produto acrescentado na comanda do atendimento.
-- ---------------------------------------------------------------------------
create table if not exists public.comanda_itens (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  branch_id       uuid not null references public.branches(id),
  comanda_id      uuid not null references public.comandas(id) on delete cascade,
  product_id      uuid not null references public.products(id),
  quantidade      integer not null check (quantidade between 1 and 100),
  acrescentado_por uuid,
  acrescentado_em timestamptz not null default now(),
  -- A venda que o vendeu, quando a comanda foi paga (nula: ainda na comanda).
  product_sale_id uuid references public.product_sales(id)
);
create index if not exists comanda_itens_comanda on public.comanda_itens (comanda_id);
create index if not exists comanda_itens_venda on public.comanda_itens (product_sale_id) where product_sale_id is not null;

-- Só o servidor lê e grava (como a comanda): RLS ligada, nenhuma política que
-- abra; as restritivas do suporte, como em toda tabela.
alter table public.comanda_itens enable row level security;
create policy suporte_sem_escrita_ins on public.comanda_itens as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.comanda_itens as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end)
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.comanda_itens as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
revoke all on public.comanda_itens from anon, authenticated;

-- ---------------------------------------------------------------------------
-- A parte dos itens num desconto que vale sobre o total (o atendimento + os
-- itens), pelo peso do que resta de cada um. Em centavos, nunca mais que o
-- que resta dos itens, nem menos do que o atendimento não comporta.
-- ---------------------------------------------------------------------------
create or replace function private.parte_dos_itens(p_valor numeric, p_atendimento numeric, p_itens numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_valor, 0) <= 0 or coalesce(p_itens, 0) <= 0 then 0
    when coalesce(p_atendimento, 0) <= 0 then least(p_valor, p_itens)
    else least(p_itens, greatest(p_valor - p_atendimento, round(p_valor * p_itens / (p_atendimento + p_itens), 2)))
  end
$$;

-- ---------------------------------------------------------------------------
-- A comanda VENDA não nasce da venda que é de uma comanda de atendimento.
-- ---------------------------------------------------------------------------
create or replace function private.comanda_da_venda()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rede    uuid;
  v_cliente uuid;
begin
  -- Fase 5b: o produto acrescentado na comanda do atendimento é vendido ao
  -- receber ELA — a venda é desta comanda, não de uma nova.
  if coalesce(current_setting('bellaris.venda_na_comanda', true), '') <> '' then
    return null;
  end if;
  if new.type::text <> 'INCOME' or new.estorno_de is not null
     or new.appointment_id is not null or new.treatment_plan_id is not null
     or num_nonnulls(new.client_package_id, new.procedure_sale_id, new.product_sale_id, new.credito_vendido_id) <> 1 then
    return null;
  end if;
  select b.tenant_id into v_rede from public.branches b where b.id = new.branch_id;
  v_cliente := coalesce(
    new.client_id,
    (select cp.client_id from public.client_packages cp where cp.id = new.client_package_id),
    (select s.client_id from public.procedure_sales s where s.id = new.procedure_sale_id),
    (select s.client_id from public.product_sales s where s.id = new.product_sale_id),
    (select s.client_id from public.creditos_vendidos s where s.id = new.credito_vendido_id));
  if v_rede is null or v_cliente is null then
    return null;
  end if;
  insert into public.comandas (tenant_id, branch_id, client_id, numero, origem,
                               client_package_id, procedure_sale_id, product_sale_id, credito_vendido_id)
  values (v_rede, new.branch_id, v_cliente, 0, 'VENDA',
          new.client_package_id, new.procedure_sale_id, new.product_sale_id, new.credito_vendido_id)
  on conflict do nothing;
  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Acrescentar e tirar o produto da comanda do atendimento.
-- ---------------------------------------------------------------------------
create or replace function public.comanda_acrescentar_item(
  p_tenant uuid, p_comanda uuid, p_produto uuid, p_quantidade integer, p_ator uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_c          public.comandas%rowtype;
  v_p          public.products%rowtype;
  v_upp        numeric;
  v_saldo      numeric;
  v_rend       numeric;
  v_disponivel numeric;
  v_ja         integer;
  v_id         uuid;
begin
  select * into v_c from public.comandas c where c.id = p_comanda and c.tenant_id = p_tenant;
  if not found then
    raise exception 'Comanda não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_c.origem <> 'ATENDIMENTO' then
    raise exception 'O produto se acrescenta na comanda de um atendimento; a venda só de produto é uma "Nova venda".' using errcode = 'P0001';
  end if;
  -- A trava do atendimento: o mesmo lugar que o receber trava.
  perform 1 from public.appointments a where a.id = v_c.appointment_id for update;
  select * into v_c from public.comandas c where c.id = p_comanda;
  if v_c.cancelada_em is not null then
    raise exception 'Esta comanda foi cancelada.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.financial_transactions f
              where f.appointment_id = v_c.appointment_id and f.is_paid
                and coalesce(f.notes, '') <> 'Estornada') then
    raise exception 'Esta comanda já foi paga: o produto agora é uma "Nova venda".' using errcode = 'P0001';
  end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then
    raise exception 'Quantidade inválida (de 1 a 100).' using errcode = 'P0001';
  end if;

  select * into v_p from public.products p where p.id = p_produto and p.tenant_id = p_tenant;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'no_data_found';
  end if;
  if not coalesce(v_p.is_active, true) then
    raise exception '% está desativado.', v_p.name using errcode = 'P0001';
  end if;
  if v_p.uso not in ('REVENDA', 'AMBOS') or v_p.sale_price is null or v_p.sale_price <= 0 then
    raise exception '% não é de Venda direta: marque o uso e o preço de venda no cadastro.', v_p.name using errcode = 'P0001';
  end if;

  select coalesce(sum(i.quantidade), 0) into v_ja
    from public.comanda_itens i
   where i.comanda_id = p_comanda and i.product_id = p_produto and i.product_sale_id is null;
  if v_ja + p_quantidade > 100 then
    raise exception 'Quantidade inválida (de 1 a 100 de cada produto).' using errcode = 'P0001';
  end if;
  if v_ja = 0 and (select count(*) from public.comanda_itens i
                    where i.comanda_id = p_comanda and i.product_sale_id is null) >= 20 then
    raise exception 'Uma comanda leva até 20 produtos.' using errcode = 'P0001';
  end if;

  -- O estoque da unidade da comanda (a mesma conta da venda de produto). Não
  -- reserva: a baixa é ao receber, e a venda confere de novo.
  v_upp := case when public.tem_unidade_de_consumo(v_p) then v_p.units_per_package end;
  select s.current_stock, s.current_rendimento into v_saldo, v_rend
    from public.branch_product_stock s
   where s.product_id = p_produto and s.branch_id = v_c.branch_id;
  if v_upp is not null then
    v_rend       := coalesce(v_rend, coalesce(v_saldo, 0) * v_upp);
    v_disponivel := floor(round(greatest(v_rend, 0) / v_upp, 6));
  else
    v_disponivel := floor(greatest(coalesce(v_saldo, 0), 0));
  end if;
  if v_ja + p_quantidade > v_disponivel then
    raise exception 'Estoque insuficiente: há % % de % nesta unidade.',
      trim_scale(v_disponivel), v_p.unit, v_p.name using errcode = 'P0001';
  end if;

  update public.comanda_itens i
     set quantidade = i.quantidade + p_quantidade
   where i.comanda_id = p_comanda and i.product_id = p_produto and i.product_sale_id is null
  returning i.id into v_id;
  if v_id is null then
    insert into public.comanda_itens (tenant_id, branch_id, comanda_id, product_id, quantidade, acrescentado_por)
    values (p_tenant, v_c.branch_id, p_comanda, p_produto, p_quantidade, p_ator)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.comanda_tirar_item(p_tenant uuid, p_item uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_i public.comanda_itens%rowtype;
  v_a uuid;
begin
  select * into v_i from public.comanda_itens i where i.id = p_item and i.tenant_id = p_tenant;
  if not found then
    raise exception 'Item não encontrado.' using errcode = 'no_data_found';
  end if;
  select c.appointment_id into v_a from public.comandas c where c.id = v_i.comanda_id;
  perform 1 from public.appointments a where a.id = v_a for update;
  select * into v_i from public.comanda_itens i where i.id = p_item;
  if not found then
    return;
  end if;
  if v_i.product_sale_id is not null then
    raise exception 'Este produto já foi vendido com a comanda: a devolução é pelo estorno da venda.' using errcode = 'P0001';
  end if;
  delete from public.comanda_itens where id = p_item;
end $$;

revoke execute on function public.comanda_acrescentar_item(uuid, uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke execute on function public.comanda_tirar_item(uuid, uuid) from public, anon, authenticated;
grant execute on function public.comanda_acrescentar_item(uuid, uuid, uuid, integer, uuid) to service_role;
grant execute on function public.comanda_tirar_item(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Receber a comanda do atendimento: o atendimento E os produtos dela.
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_pagamento_do_atendimento(p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_status    text;
  v_unidade   uuid;
  v_cliente   uuid;
  v_preco     numeric;
  v_plano     uuid;
  v_rede      uuid;
  v_proc      uuid;
  v_prof      uuid;
  v_metodo    text    := nullif(trim(coalesce(p_dados ->> 'metodo', '')), '');
  v_pontos    int     := coalesce((p_dados ->> 'pontos')::int, 0);
  v_desconto  numeric := round(coalesce((p_dados ->> 'desconto')::numeric, 0), 2);
  v_final     numeric := round(coalesce((p_dados ->> 'valor_final')::numeric, -1), 2);
  v_vid       uuid    := nullif(p_dados ->> 'voucher_id', '')::uuid;
  v_dv        numeric := round(coalesce((p_dados ->> 'desconto_voucher')::numeric, 0), 2);
  v_dvenda    numeric := round(coalesce((p_dados ->> 'desconto_venda')::numeric, 0), 2);
  v_vezes     int     := coalesce(nullif(p_dados ->> 'cartao_vezes', '')::int, 1);
  -- r3-f13-01: a bandeira do cartão, opcional.
  v_bandeira  text    := private.bandeira_do_cartao(nullif(trim(coalesce(p_dados ->> 'metodo', '')), ''), p_dados ->> 'cartao_bandeira');
  v_maquina   uuid    := nullif(p_dados ->> 'maquininha_id', '')::uuid;
  v_motivo    text    := left(nullif(trim(coalesce(p_dados ->> 'desconto_motivo', '')), ''), 300);
  v_voucher   public.loyalty_vouchers%rowtype;
  v_esperado  numeric;
  v_base      numeric;
  v_cfg       public.loyalty_configs%rowtype;
  v_saldo     int;
  v_tx        uuid;
  v_pago      boolean;
  v_agora     timestamptz := now();
  v_descricao text;
  -- Fase 5b: os produtos da comanda.
  v_comanda   uuid;
  v_itens     numeric := 0;
  v_itens_txt text;
  v_itens_js  jsonb;
  v_total     numeric;
  v_rem_at    numeric;
  v_rem_it    numeric;
  v_dv_it     numeric := 0;
  v_dvenda_it numeric := 0;
  v_desc_it   numeric := 0;
  v_pts_it    int     := 0;
  v_venda     uuid;
  v_tx_it     uuid;
  v_vendedor  uuid;
begin
  select a.status::text, a.branch_id, a.client_id, a.price, a.treatment_plan_id, a.procedure_id, a.professional_id, b.tenant_id
    into v_status, v_unidade, v_cliente, v_preco, v_plano, v_proc, v_prof, v_rede
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status not in ('IN_PROGRESS', 'COMPLETED') then
    raise exception 'O atendimento ainda não começou: a comanda nasce quando ele é iniciado.' using errcode = 'P0001';
  end if;
  if v_plano is not null then
    raise exception 'Sessão de plano de tratamento: o pagamento é recebido no plano, não no atendimento.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.package_sessions ps where ps.appointment_id = p_agendamento) then
    raise exception 'Sessão de pacote: já foi paga na venda do pacote.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.procedure_sale_units u where u.appointment_id = p_agendamento and u.status <> 'CANCELADA') then
    raise exception 'Procedimento pré-pago: já foi pago na venda.' using errcode = 'P0001';
  end if;
  if coalesce(v_preco, 0) <= 0 then
    raise exception 'Atendimento sem cobrança: não há o que receber.' using errcode = 'P0001';
  end if;

  -- Os produtos acrescentados na comanda (fase 5b), ao preço de venda de hoje
  -- — o mesmo que a venda de produto grava.
  select c.id into v_comanda from public.comandas c
   where c.appointment_id = p_agendamento and c.cancelada_em is null;
  if v_comanda is not null then
    select coalesce(sum(round(p.sale_price, 2) * i.quantidade), 0),
           string_agg(i.quantidade || '× ' || p.name, ' + ' order by i.acrescentado_em, i.id),
           jsonb_agg(jsonb_build_object('product_id', i.product_id, 'quantity', i.quantidade) order by i.acrescentado_em, i.id)
      into v_itens, v_itens_txt, v_itens_js
      from public.comanda_itens i
      join public.products p on p.id = i.product_id
     where i.comanda_id = v_comanda and i.product_sale_id is null;
    v_itens := coalesce(v_itens, 0);
  end if;
  v_total := round(v_preco, 2) + v_itens;

  if v_pontos < 0 or v_desconto < 0 or v_final < 0 or v_dv < 0 or v_dvenda < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
  end if;
  if v_vezes < 1 or v_vezes > 12 or (v_vezes > 1 and v_metodo is distinct from 'CREDIT_CARD') then
    raise exception 'Parcelar na maquininha só no cartão de crédito, de 1 a 12 vezes.' using errcode = 'P0001';
  end if;
  if v_final + v_desconto + v_dv + v_dvenda <> v_total then
    raise exception 'O valor recebido mais os descontos não fecham com o total da comanda.' using errcode = 'P0001';
  end if;
  if v_final > 0 and v_metodo is null then
    raise exception 'Selecione a forma de pagamento.' using errcode = 'P0001';
  end if;
  if v_pontos = 0 and v_desconto > 0 then
    raise exception 'Desconto sem pontos.' using errcode = 'P0001';
  end if;
  if v_vid is null and v_dv > 0 then
    raise exception 'Desconto de voucher sem voucher.' using errcode = 'P0001';
  end if;
  -- O motivo é do desconto comercial: sem desconto, não se grava.
  if v_dvenda = 0 then
    v_motivo := null;
  end if;

  if v_pontos > 0 or v_vid is not null then
    select * into v_cfg from public.loyalty_configs c where c.tenant_id = p_tenant and c.enabled;
    if not found then
      raise exception 'O programa de fidelidade está desligado nesta rede.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_cliente::text));
  end if;

  if v_vid is not null then
    select * into v_voucher from public.loyalty_vouchers v where v.id = v_vid for update;
    if not found or v_voucher.tenant_id is distinct from p_tenant or v_voucher.client_id is distinct from v_cliente then
      raise exception 'Voucher não encontrado para este cliente.' using errcode = 'no_data_found';
    end if;
    if v_voucher.status <> 'ATIVO' then
      raise exception 'Este voucher já foi usado ou cancelado.' using errcode = 'P0001';
    end if;
    if v_voucher.expires_at <= v_agora then
      raise exception 'Voucher vencido.' using errcode = 'P0001';
    end if;
    if v_cfg.scope_per_branch and v_voucher.branch_id <> v_unidade then
      raise exception 'Este voucher é de outra unidade.' using errcode = 'P0001';
    end if;
    -- O voucher de procedimento paga o atendimento; o de desconto vale sobre
    -- o total da comanda (FD2a).
    v_esperado := case v_voucher.type
      when 'PROCEDIMENTO' then
        case when v_voucher.procedure_id = v_proc then round(v_preco, 2) else null end
      when 'DESCONTO_VALOR'      then least(v_voucher.discount_value, v_total)
      when 'DESCONTO_PERCENTUAL' then round(v_total * v_voucher.discount_value / 100, 2)
      else null end;
    if v_voucher.type = 'PRODUTO' then
      raise exception 'Voucher de produto é entregue, não aplicado no pagamento.' using errcode = 'P0001';
    end if;
    if v_esperado is null then
      raise exception 'Este voucher é de outro procedimento.' using errcode = 'P0001';
    end if;
    if v_dv <> v_esperado then
      raise exception 'O desconto não corresponde ao voucher.' using errcode = 'P0001';
    end if;
  end if;

  if v_dvenda > v_total - v_dv then
    raise exception 'O desconto não pode ser maior que o total da comanda.' using errcode = 'P0001';
  end if;

  v_base := v_total - v_dv - v_dvenda;
  if v_pontos > 0 then
    if v_pontos < v_cfg.redeem_min_points then
      raise exception 'O mínimo para usar pontos é % pontos.', v_cfg.redeem_min_points using errcode = 'P0001';
    end if;
    if v_desconto <> least(round(v_pontos * v_cfg.redeem_points_value, 2), v_base) then
      raise exception 'O desconto não corresponde aos pontos usados.' using errcode = 'P0001';
    end if;
    if v_desconto > round(v_base * v_cfg.redeem_max_pct / 100, 2) then
      raise exception 'Os pontos pagam no máximo % %% da comanda.',
        trim(to_char(v_cfg.redeem_max_pct, 'FM990D##')) using errcode = 'P0001';
    end if;
    v_saldo := public.saldo_de_pontos(v_cliente, case when v_cfg.scope_per_branch then v_unidade else null end);
    if v_saldo < v_pontos then
      raise exception 'Saldo de pontos insuficiente: o cliente tem % pontos.', greatest(v_saldo, 0) using errcode = 'P0001';
    end if;
  end if;

  -- A parte dos produtos em cada desconto, pelo peso do que resta de cada um
  -- (o voucher, depois o desconto comercial, depois os pontos — a ordem da
  -- tela). O voucher de procedimento é todo do atendimento.
  v_rem_at := round(v_preco, 2);
  v_rem_it := v_itens;
  if v_itens > 0 then
    v_dv_it := case when v_vid is not null and v_voucher.type = 'PROCEDIMENTO' then 0
                    else private.parte_dos_itens(v_dv, v_rem_at, v_rem_it) end;
    v_rem_at := v_rem_at - (v_dv - v_dv_it);
    v_rem_it := v_rem_it - v_dv_it;
    v_dvenda_it := private.parte_dos_itens(v_dvenda, v_rem_at, v_rem_it);
    v_rem_at := v_rem_at - (v_dvenda - v_dvenda_it);
    v_rem_it := v_rem_it - v_dvenda_it;
    v_desc_it := private.parte_dos_itens(v_desconto, v_rem_at, v_rem_it);
    v_pts_it := case when v_desconto > 0 then round(v_pontos * v_desc_it / v_desconto)::int else 0 end;
  end if;

  -- O lançamento VIVO do atendimento (D6, 2026-10-28): o estornado fica no
  -- histórico e não segura o recebimento novo.
  select f.id, f.is_paid into v_tx, v_pago
    from public.financial_transactions f
   where f.appointment_id = p_agendamento
     and coalesce(f.notes, '') <> 'Estornada'
   for update;

  if v_pago then
    raise exception 'Pagamento já registrado para este atendimento.' using errcode = 'P0001';
  end if;

  if v_tx is not null then
    update public.financial_transactions
       set amount           = round(v_preco, 2) - (v_dv - v_dv_it) - (v_dvenda - v_dvenda_it) - (v_desconto - v_desc_it),
           loyalty_discount = (v_desconto - v_desc_it) + (v_dv - v_dv_it),
           sale_discount    = v_dvenda - v_dvenda_it,
           desconto_motivo  = v_motivo,
           payment_method   = v_metodo::public."PaymentMethod",
           cartao_vezes     = case when v_vezes > 1 then v_vezes end,
           cartao_bandeira  = v_bandeira,
           maquininha_id    = v_maquina,
           is_paid          = true,
           recebido_por     = (select u.id from public.users u where u.id = p_ator),
           paid_at          = v_agora,
           updated_at       = v_agora
     where id = v_tx;
  else
    insert into public.financial_transactions (
      branch_id, appointment_id, client_id, type, category, description,
      amount, loyalty_discount, sale_discount, desconto_motivo, payment_method, cartao_vezes, cartao_bandeira, maquininha_id, is_paid, paid_at, created_by
    ) values (
      v_unidade, p_agendamento, v_cliente, 'INCOME', 'Serviços', 'Atendimento concluído',
      round(v_preco, 2) - (v_dv - v_dv_it) - (v_dvenda - v_dvenda_it) - (v_desconto - v_desc_it),
      (v_desconto - v_desc_it) + (v_dv - v_dv_it), v_dvenda - v_dvenda_it, v_motivo, v_metodo::public."PaymentMethod",
      case when v_vezes > 1 then v_vezes end, v_bandeira, v_maquina, true, v_agora,
      coalesce(p_ator::text, 'sistema')
    )
    returning id into v_tx;
  end if;

  -- Os produtos: a MESMA venda da "Nova venda" (estoque pelos lotes, comissão
  -- de quem vendeu — a profissional do atendimento), sem abrir outra comanda.
  -- O lançamento nasce em aberto e fica pago já com a parte dos pontos e do
  -- voucher: o ponto ganho (FD2b) sai do que foi pago em dinheiro.
  if v_itens > 0 then
    select u.id into v_vendedor from public.users u
     where u.id = v_prof and u.tenant_id = p_tenant and coalesce(u.is_active, true);
    perform set_config('bellaris.venda_na_comanda', v_comanda::text, true);
    v_venda := public.produto_vender_itens(
      p_tenant, v_cliente, v_unidade, p_ator, v_vendedor, v_itens_js, v_dvenda_it,
      jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'amount', v_itens - v_dvenda_it,
        'payment_method', v_metodo,
        'is_paid', false,
        'cartao_vezes', case when v_vezes > 1 then v_vezes end,
        'cartao_bandeira', v_bandeira,
        'maquininha_id', v_maquina,
        'desconto_motivo', case when v_dvenda_it > 0 then v_motivo end))));
    perform set_config('bellaris.venda_na_comanda', '', true);

    select f.id into v_tx_it from public.financial_transactions f where f.product_sale_id = v_venda limit 1;
    update public.financial_transactions
       set amount           = v_itens - v_dvenda_it - v_dv_it - v_desc_it,
           loyalty_discount = v_dv_it + v_desc_it,
           sale_discount    = v_dvenda_it,
           is_paid          = true,
           paid_at          = v_agora,
           recebido_por     = (select u.id from public.users u where u.id = p_ator),
           updated_at       = v_agora
     where id = v_tx_it;

    update public.comanda_itens set product_sale_id = v_venda
     where comanda_id = v_comanda and product_sale_id is null;
  end if;

  if v_vid is not null then
    update public.loyalty_vouchers
       set status = 'USADO', used_at = v_agora, used_transaction_id = v_tx
     where id = v_vid;
  end if;

  -- Os pontos usados: um resgate por lançamento, com a parte de cada um — o
  -- estorno de um devolve só os pontos dele.
  if v_pontos - v_pts_it > 0 then
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description,
      transaction_id, appointment_id, created_by
    ) values (
      public.fidelidade_conta(v_cliente), v_unidade, 'RESGATE', -(v_pontos - v_pts_it),
      'Desconto no pagamento: R$ ' || replace(to_char(v_desconto - v_desc_it, 'FM999999990.00'), '.', ','),
      v_tx, p_agendamento, coalesce(p_ator::text, 'sistema')
    );
  end if;
  if v_pts_it > 0 then
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description,
      transaction_id, appointment_id, created_by
    ) values (
      public.fidelidade_conta(v_cliente), v_unidade, 'RESGATE', -v_pts_it,
      'Desconto no pagamento: R$ ' || replace(to_char(v_desc_it, 'FM999999990.00'), '.', ','),
      v_tx_it, p_agendamento, coalesce(p_ator::text, 'sistema')
    );
  end if;

  if p_ator is not null then
    -- A forma com o nome da tela ("Crédito 3x", "Dinheiro") — D18, 2026-10-29.
    v_descricao := 'Pagamento confirmado'
      || coalesce(' via ' || private.rotulo_do_pagamento(p_tenant, v_metodo, v_vezes, v_bandeira, v_maquina), '');
    if v_itens > 0 then
      v_descricao := v_descricao || ', com ' || v_itens_txt;
    end if;
    if v_dvenda > 0 then
      v_descricao := v_descricao || ', com desconto de R$ ' || replace(to_char(v_dvenda, 'FM999999990.00'), '.', ',')
        || coalesce(' (' || v_motivo || ')', '');
    end if;
    if v_vid is not null then
      v_descricao := v_descricao || ', com o voucher "' || v_voucher.name || '"';
    end if;
    if v_pontos > 0 then
      v_descricao := v_descricao || ', com ' || v_pontos || ' pontos (R$ ' ||
        replace(to_char(v_desconto, 'FM999999990.00'), '.', ',') || ')';
    end if;
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'PAYMENT_CONFIRMED', v_descricao);
  end if;

  return v_tx;
end;
$function$;

-- ---------------------------------------------------------------------------
-- FD2a na "Nova venda": os pontos e o voucher, à vista.
-- ---------------------------------------------------------------------------
create or replace function private.fidelidade_na_venda(
  p_tenant uuid, p_cliente uuid, p_unidade uuid, p_tx uuid, p_fidelidade jsonb, p_ator uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_pontos   int     := coalesce((p_fidelidade ->> 'pontos')::int, 0);
  v_desconto numeric := round(coalesce((p_fidelidade ->> 'desconto')::numeric, 0), 2);
  v_vid      uuid    := nullif(p_fidelidade ->> 'voucher_id', '')::uuid;
  v_dv       numeric := round(coalesce((p_fidelidade ->> 'desconto_voucher')::numeric, 0), 2);
  v_cfg      public.loyalty_configs%rowtype;
  v_voucher  public.loyalty_vouchers%rowtype;
  v_tx       public.financial_transactions%rowtype;
  v_base     numeric;
  v_esperado numeric;
  v_saldo    int;
  v_agora    timestamptz := now();
begin
  if v_pontos < 0 or v_desconto < 0 or v_dv < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
  end if;
  if v_pontos = 0 and v_desconto > 0 then
    raise exception 'Desconto sem pontos.' using errcode = 'P0001';
  end if;
  if v_vid is null and v_dv > 0 then
    raise exception 'Desconto de voucher sem voucher.' using errcode = 'P0001';
  end if;
  select * into v_tx from public.financial_transactions f where f.id = p_tx for update;
  if not found or v_tx.is_paid or v_tx.client_id is distinct from p_cliente then
    raise exception 'Lançamento da venda não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_pontos > 0 or v_vid is not null then
    select * into v_cfg from public.loyalty_configs c where c.tenant_id = p_tenant and c.enabled;
    if not found then
      raise exception 'O programa de fidelidade está desligado nesta rede.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || p_cliente::text));
  end if;

  v_base := round(v_tx.amount, 2);
  if v_vid is not null then
    select * into v_voucher from public.loyalty_vouchers v where v.id = v_vid for update;
    if not found or v_voucher.tenant_id is distinct from p_tenant or v_voucher.client_id is distinct from p_cliente then
      raise exception 'Voucher não encontrado para este cliente.' using errcode = 'no_data_found';
    end if;
    if v_voucher.status <> 'ATIVO' then
      raise exception 'Este voucher já foi usado ou cancelado.' using errcode = 'P0001';
    end if;
    if v_voucher.expires_at <= v_agora then
      raise exception 'Voucher vencido.' using errcode = 'P0001';
    end if;
    if v_cfg.scope_per_branch and v_voucher.branch_id <> p_unidade then
      raise exception 'Este voucher é de outra unidade.' using errcode = 'P0001';
    end if;
    -- Na venda vale o voucher de DESCONTO; o de procedimento paga o atendimento
    -- daquele procedimento, e o de produto é entregue.
    v_esperado := case v_voucher.type
      when 'DESCONTO_VALOR'      then least(v_voucher.discount_value, v_base)
      when 'DESCONTO_PERCENTUAL' then round(v_base * v_voucher.discount_value / 100, 2)
      else null end;
    if v_esperado is null then
      raise exception 'Este voucher não vale nesta venda: o de procedimento se usa no atendimento, e o de produto é entregue.' using errcode = 'P0001';
    end if;
    if v_dv <> v_esperado then
      raise exception 'O desconto não corresponde ao voucher.' using errcode = 'P0001';
    end if;
  end if;

  v_base := v_base - v_dv;
  if v_pontos > 0 then
    if v_pontos < v_cfg.redeem_min_points then
      raise exception 'O mínimo para usar pontos é % pontos.', v_cfg.redeem_min_points using errcode = 'P0001';
    end if;
    if v_desconto <> least(round(v_pontos * v_cfg.redeem_points_value, 2), v_base) then
      raise exception 'O desconto não corresponde aos pontos usados.' using errcode = 'P0001';
    end if;
    if v_desconto > round(v_base * v_cfg.redeem_max_pct / 100, 2) then
      raise exception 'Os pontos pagam no máximo % %% da venda.',
        trim(to_char(v_cfg.redeem_max_pct, 'FM990D##')) using errcode = 'P0001';
    end if;
    v_saldo := public.saldo_de_pontos(p_cliente, case when v_cfg.scope_per_branch then p_unidade else null end);
    if v_saldo < v_pontos then
      raise exception 'Saldo de pontos insuficiente: o cliente tem % pontos.', greatest(v_saldo, 0) using errcode = 'P0001';
    end if;
  end if;

  update public.financial_transactions
     set amount           = round(v_tx.amount, 2) - v_dv - v_desconto,
         loyalty_discount = v_dv + v_desconto,
         is_paid          = true,
         paid_at          = v_agora,
         recebido_por     = (select u.id from public.users u where u.id = p_ator),
         updated_at       = v_agora
   where id = p_tx;

  if v_vid is not null then
    update public.loyalty_vouchers
       set status = 'USADO', used_at = v_agora, used_transaction_id = p_tx
     where id = v_vid;
  end if;
  if v_pontos > 0 then
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description, transaction_id, created_by
    ) values (
      public.fidelidade_conta(p_cliente), p_unidade, 'RESGATE', -v_pontos,
      'Desconto no pagamento: R$ ' || replace(to_char(v_desconto, 'FM999999990.00'), '.', ','),
      p_tx, coalesce(p_ator::text, 'sistema')
    );
  end if;
end $$;

-- A venda com os pontos e o voucher: a MESMA venda de sempre (o tipo diz
-- qual), com o pagamento à vista em aberto, e os pontos e o voucher aplicados
-- nele antes de ficar pago — tudo numa transação.
create or replace function public.venda_com_fidelidade(
  p_tenant uuid, p_tipo text, p_args jsonb, p_fidelidade jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_l        jsonb := p_args -> 'p_lancamentos';
  v_cliente  uuid  := (p_args ->> 'p_cliente')::uuid;
  v_unidade  uuid  := (p_args ->> 'p_unidade')::uuid;
  v_ator     uuid  := nullif(p_args ->> 'p_ator', '')::uuid;
  v_vendedor uuid  := nullif(p_args ->> 'p_vendedor', '')::uuid;
  v_desc     numeric := coalesce((p_args ->> 'p_desconto')::numeric, 0);
  v_id       uuid;
  v_tx       uuid;
begin
  if jsonb_typeof(v_l) is distinct from 'array' or jsonb_array_length(v_l) <> 1
     or not coalesce((v_l -> 0 ->> 'is_paid')::boolean, false) then
    raise exception 'Os pontos e o voucher se usam no pagamento à vista.' using errcode = 'P0001';
  end if;
  v_l := jsonb_build_array(jsonb_set(v_l -> 0, '{is_paid}', 'false'::jsonb));

  case p_tipo
    when 'PRODUTO' then
      v_id := public.produto_vender_itens(p_tenant, v_cliente, v_unidade, v_ator, v_vendedor,
                p_args -> 'p_itens', v_desc, v_l);
      select f.id into v_tx from public.financial_transactions f where f.product_sale_id = v_id limit 1;
    when 'PACOTE' then
      v_id := public.pacote_vender_com_equipe(p_tenant, v_cliente, (p_args ->> 'p_pacote')::uuid, v_unidade, v_ator,
                v_vendedor, nullif(p_args ->> 'p_responsavel', '')::uuid, v_l, p_args -> 'p_sessoes', v_desc);
      select f.id into v_tx from public.financial_transactions f where f.client_package_id = v_id limit 1;
    when 'PROCEDIMENTO' then
      v_id := public.procedimento_vender_com_equipe(p_tenant, v_cliente, (p_args ->> 'p_procedimento')::uuid, v_unidade, v_ator,
                v_vendedor, (p_args ->> 'p_quantidade')::int, v_desc, nullif(p_args ->> 'p_validade_dias', '')::int,
                v_l, p_args -> 'p_unidades');
      select f.id into v_tx from public.financial_transactions f where f.procedure_sale_id = v_id limit 1;
    else
      raise exception 'Venda inválida.' using errcode = 'P0001';
  end case;

  perform private.fidelidade_na_venda(p_tenant, v_cliente, v_unidade, v_tx, p_fidelidade, v_ator);
  return v_id;
end $$;

revoke execute on function public.venda_com_fidelidade(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.venda_com_fidelidade(uuid, text, jsonb, jsonb) to service_role;
revoke execute on function private.fidelidade_na_venda(uuid, uuid, uuid, uuid, jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O PDV: a comanda do atendimento vale o atendimento MAIS os produtos dela,
-- e o recebido soma o que entrou pelos dois.
-- ---------------------------------------------------------------------------
create or replace function public.pdv_comandas(p_tenant uuid, p_branch uuid, p_situacao text, p_de timestamp with time zone, p_ate timestamp with time zone)
 returns table(id uuid, numero integer, origem text, aberta_em timestamp with time zone, cancelada_em timestamp with time zone, cancelada_motivo text, client_id uuid, cliente text, appointment_id uuid, procedimento text, profissional text, agendado_para timestamp with time zone, atendimento_status text, valor numeric, paga boolean, paga_em timestamp with time zone, recebido numeric, forma text, lancamento_id uuid, estornada boolean, treatment_plan_id uuid)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with c as (
    select c.*, a.price, a.scheduled_at, a.status::text as a_status, a.procedure_id, a.professional_id,
           f.id as f_id, f.paid_at, f.amount, f.payment_method::text as f_forma,
           it.valor as it_valor, it.recebido as it_recebido,
           v.valor as v_valor, v.recebido as v_recebido, v.forma as v_forma, v.estornada as v_estornada,
           v.primeiro as v_primeiro,
           case
             when c.client_package_id is not null then (select sp.name from public.client_packages cp
                 join public.service_packages sp on sp.id = cp.package_id where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select s.quantity || '× ' || pr.name from public.procedure_sales s
                 join public.procedures pr on pr.id = s.procedure_id where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select coalesce(nullif(s.descricao, ''), p.name) from public.product_sales s
                 left join public.products p on p.id = s.product_id where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then 'Crédito na rede'
             when c.treatment_plan_id is not null then (select coalesce(nullif(trim(tp.name), ''), 'Plano de tratamento')
                 from public.treatment_plans tp where tp.id = c.treatment_plan_id)
           end as v_item,
           case
             when c.client_package_id is not null then (select u.name from public.client_packages cp
                 join public.users u on u.id = cp.sold_by where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select u.name from public.procedure_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select u.name from public.product_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then (select s.registrado_por_nome from public.creditos_vendidos s
                 where s.id = c.credito_vendido_id)
             when c.treatment_plan_id is not null then (select u.name from public.treatment_plans tp
                 join public.users u on u.id = tp.professional_id where tp.id = c.treatment_plan_id)
           end as v_quem,
           case when c.treatment_plan_id is not null then (select coalesce(sum(p.price), 0)
                 from public.treatment_plan_session_procedures p
                 join public.treatment_plan_sessions s on s.id = p.session_id
                where s.plan_id = c.treatment_plan_id) end as pl_valor
      from public.comandas c
      left join public.appointments a on a.id = c.appointment_id
      left join lateral (
        select f.id, f.paid_at, f.amount, f.payment_method
          from public.financial_transactions f
         where c.appointment_id is not null and f.appointment_id = c.appointment_id and f.is_paid
           and coalesce(f.notes, '') <> 'Estornada'
         order by f.paid_at desc nulls last
         limit 1
      ) f on true
      -- Fase 5b: os produtos da comanda do atendimento — o que ainda está nela
      -- ao preço de hoje, o vendido pelo preço da venda; e o que entrou por eles.
      left join lateral (
        select coalesce((select sum(round(p.sale_price, 2) * i.quantidade)
                           from public.comanda_itens i join public.products p on p.id = i.product_id
                          where i.comanda_id = c.id and i.product_sale_id is null), 0)
             + coalesce((select sum(ps.preco_tabela) from public.product_sales ps
                          where ps.id in (select i.product_sale_id from public.comanda_itens i where i.comanda_id = c.id)), 0) as valor,
               coalesce((select sum(t.amount) from public.financial_transactions t
                          where t.product_sale_id in (select i.product_sale_id from public.comanda_itens i where i.comanda_id = c.id)
                            and t.type::text = 'INCOME' and t.estorno_de is null and t.is_paid
                            and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido
         where c.origem = 'ATENDIMENTO'
      ) it on true
      left join lateral (
        select sum(coalesce(t.valor_antes_do_estorno, t.amount)) as valor,
               coalesce(sum(t.amount) filter (where t.is_paid and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido,
               -- PDV8: o crediário é a forma; o a receber sem meio, "A receber".
               case
                 when bool_or(t.parcela_grupo is not null) then 'CREDIARIO'
                 else coalesce(
                   (array_agg(t.payment_method::text order by t.parcela_numero nulls first, t.created_at))[1],
                   case when bool_or(not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada') then 'A_RECEBER' end)
               end as forma,
               bool_and(coalesce(t.notes, '') = 'Estornada') as estornada,
               min(t.created_at) filter (where coalesce(t.notes, '') <> 'Estornada') as primeiro
          from public.financial_transactions t
         where c.origem in ('VENDA', 'PLANO') and t.type::text = 'INCOME' and t.estorno_de is null
           and (t.client_package_id = c.client_package_id or t.procedure_sale_id = c.procedure_sale_id
                or t.product_sale_id = c.product_sale_id or t.credito_vendido_id = c.credito_vendido_id
                or t.treatment_plan_id = c.treatment_plan_id)
      ) v on true
     where c.tenant_id = p_tenant and c.branch_id = p_branch
  ), s as (
    select c.*,
           case c.origem
             when 'VENDA' then true
             when 'PLANO' then c.v_primeiro is not null
             else c.f_id is not null
           end as e_paga,
           case c.origem
             when 'VENDA' then c.aberta_em
             when 'PLANO' then c.v_primeiro
             else c.paid_at
           end as e_paga_em
      from c
  )
  select s.id, s.numero, s.origem, s.aberta_em, s.cancelada_em, s.cancelada_motivo,
         s.client_id, cl.name, s.appointment_id,
         case when s.origem in ('VENDA', 'PLANO') then s.v_item else pr.name end,
         case when s.origem in ('VENDA', 'PLANO') then s.v_quem else u.name end,
         s.scheduled_at, s.a_status,
         round(case s.origem
                 when 'VENDA' then coalesce(s.v_valor, 0)
                 when 'PLANO' then coalesce(s.pl_valor, 0)
                 else coalesce(s.price, 0) + coalesce(s.it_valor, 0) end, 2),
         s.e_paga,
         s.e_paga_em,
         round(case when s.origem in ('VENDA', 'PLANO') then s.v_recebido
                    else s.amount + coalesce(s.it_recebido, 0) end, 2),
         case when s.origem in ('VENDA', 'PLANO') then s.v_forma else s.f_forma end,
         s.f_id,
         s.origem in ('VENDA', 'PLANO') and s.v_valor is not null and coalesce(s.v_estornada, false),
         s.treatment_plan_id
    from s
    left join public.clients cl on cl.id = s.client_id
    left join public.procedures pr on pr.id = s.procedure_id
    left join public.users u on u.id = s.professional_id
   where case p_situacao
           when 'ABERTAS' then s.cancelada_em is null and not s.e_paga
           when 'PAGAS'   then s.e_paga and s.e_paga_em between p_de and p_ate
           else (s.cancelada_em is null and not s.e_paga)
             or (s.e_paga and s.e_paga_em between p_de and p_ate)
             or (s.cancelada_em between p_de and p_ate)
         end
$function$;

notify pgrst, 'reload schema';
