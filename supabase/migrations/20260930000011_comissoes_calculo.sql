-- Comissões, fase 2: a comissão DEVIDA por procedimento executado
-- (`commission_lines`) e o EXTRATO de lançamentos (`commissions`), acertado
-- por uma função só sempre que algo muda o que é devido.
--
-- O desenho é de acerto, não de evento: `comissao_acertar_linha` calcula o
-- quanto a linha deve AGORA (`comissao_alvo`) e lança a diferença para o que
-- já foi lançado. Conclusão, pagamento do atendimento, recebimento do plano e
-- estorno chamam a mesma coisa — e chamar duas vezes não lança duas vezes.
--
-- A conta do valor mora AQUI, e só aqui: o recebimento do plano entra por
-- gatilho em `financial_transactions` (receita paga nasce em vários lugares do
-- código, §9.9), e o gatilho precisa dela. O app escolhe a regra e a base de
-- cada procedimento (`finishSession`); o banco faz o resto.
--
-- Compatível com o código no ar até o deploy: `concluir_atendimento` ainda
-- aceita o `comissao` singular do `finishSession` antigo.

-- ─── A comissão devida, por procedimento executado ───────────────────────────
create table public.commission_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  branch_id         uuid not null references public.branches(id),
  appointment_id    uuid not null references public.appointments(id) on delete cascade,
  -- Posição do procedimento no atendimento (a sessão de plano tem vários, e o
  -- mesmo procedimento pode aparecer duas vezes).
  item              int  not null default 0,
  procedure_id      uuid references public.procedures(id) on delete set null,
  professional_id   uuid not null references public.users(id),
  origem            text not null check (origem in ('AVULSO', 'PLANO', 'PACOTE')),
  treatment_plan_id uuid references public.treatment_plans(id) on delete set null,
  -- Retrato da regra e da configuração no momento da conclusão: mudar depois
  -- vale para os próximos atendimentos, não reescreve o que já foi feito.
  regra_tipo        public."CommissionType" not null,
  regra_valor       numeric not null,
  modo              text not null check (modo in ('ATENDIMENTO', 'PAGAMENTO')),
  desconta_insumos  boolean not null default false,
  desconta_taxa     boolean not null default false,
  base_com_pontos   text not null default 'PRECO' check (base_com_pontos in ('PRECO', 'VALOR_PAGO')),
  -- A base: avulso = preço do atendimento; plano = preço do procedimento no
  -- plano; pacote = preço do pacote ÷ sessões.
  preco             numeric not null check (preco >= 0),
  -- Custo dos insumos do atendimento, rateado pelo preço de cada procedimento.
  custo_insumos     numeric not null default 0,
  status            text not null default 'ATIVA' check (status in ('ATIVA', 'CANCELADA')),
  created_at        timestamptz not null default now(),
  unique (appointment_id, item)
);
create index idx_commission_lines_plano on public.commission_lines (treatment_plan_id) where treatment_plan_id is not null;
create index idx_commission_lines_prof  on public.commission_lines (tenant_id, professional_id);

alter table public.commission_lines enable row level security;
create policy commission_lines_select on public.commission_lines for select
  using (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

-- ─── O extrato: cada lançamento de uma linha ─────────────────────────────────
alter table public.commissions
  add column line_id        uuid references public.commission_lines(id) on delete cascade,
  add column kind           text not null default 'LIBERACAO' check (kind in ('LIBERACAO', 'AJUSTE', 'ESTORNO')),
  add column motivo         text,
  -- O período do lançamento (o fechamento da fase 3 corta por aqui).
  add column released_at    timestamptz not null default now(),
  add column transaction_id uuid references public.financial_transactions(id) on delete set null;
create index idx_commissions_line on public.commissions (line_id);

-- As de antes viram linha + lançamento (eram todas de demonstração).
with antigas as (
  select c.id as commission_id, c.branch_id, c.professional_id, c.appointment_id, c.type, c.rule_value,
         b.tenant_id, a.procedure_id, a.treatment_plan_id, a.price, a.completed_at, a.scheduled_at,
         case when a.treatment_plan_id is not null then 'PLANO'
              when exists (select 1 from public.package_sessions ps where ps.appointment_id = a.id) then 'PACOTE'
              else 'AVULSO' end as origem
    from public.commissions c
    join public.appointments a on a.id = c.appointment_id
    join public.branches b on b.id = c.branch_id
   where c.line_id is null
), linhas as (
  insert into public.commission_lines
    (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
     regra_tipo, regra_valor, modo, preco)
  select an.tenant_id, an.branch_id, an.appointment_id, 0, an.procedure_id, an.professional_id, an.origem,
         an.treatment_plan_id, an.type, an.rule_value, 'ATENDIMENTO', coalesce(an.price, 0)
    from antigas an
  on conflict (appointment_id, item) do nothing
  returning id, appointment_id
)
update public.commissions c
   set line_id = l.id, kind = 'LIBERACAO', motivo = 'Atendimento concluído',
       released_at = coalesce(an.completed_at, an.scheduled_at, c.released_at)
  from linhas l
  join antigas an on an.appointment_id = l.appointment_id
 where c.id = an.commission_id;

-- ─── A taxa da maquininha de um recebimento ──────────────────────────────────
-- A do meio; no crédito, a da maior quantidade de parcelas cadastrada até a do
-- recebimento. Meio sem taxa (dinheiro, crédito interno): 0.
create or replace function private.comissao_taxa_pct(p_tenant uuid, p_metodo text, p_parcelas int)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select f.taxa_pct from public.payment_fees f
     where f.tenant_id = p_tenant and f.metodo = p_metodo
       and f.parcelas <= greatest(1, least(12, coalesce(p_parcelas, 1)))
     order by f.parcelas desc
     limit 1
  ), 0)
$$;

-- ─── Quanto a linha deve AGORA ───────────────────────────────────────────────
create or replace function private.comissao_alvo(p_linha uuid)
returns numeric
language plpgsql stable security definer set search_path = ''
as $$
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
  v_total     numeric;
  v_recebido  numeric;
begin
  select * into v_l from public.commission_lines cl where cl.id = p_linha;
  if not found or v_l.status = 'CANCELADA' then
    return 0;
  end if;

  if v_l.origem = 'AVULSO' then
    -- O pagamento do atendimento (um lançamento por atendimento, UNIQUE).
    select f.is_paid and coalesce(f.notes, '') <> 'Estornada',
           coalesce(f.notes, '') = 'Estornada',
           coalesce(f.loyalty_discount, 0),
           f.payment_method::text
      into v_pago, v_estornado, v_desconto, v_metodo
      from public.financial_transactions f
     where f.appointment_id = v_l.appointment_id and f.type = 'INCOME';
    v_pago      := coalesce(v_pago, false);
    v_estornado := coalesce(v_estornado, false);
    if v_pago then
      v_taxa := private.comissao_taxa_pct(v_l.tenant_id, v_metodo, 1);
    else
      v_desconto := 0;
    end if;
    -- Modo PAGAMENTO: só vale pago. Modo ATENDIMENTO: vale desde a conclusão,
    -- e o estorno do pagamento a desfaz.
    v_fracao := case
      when v_l.modo = 'PAGAMENTO' then case when v_pago then 1 else 0 end
      else case when v_estornado then 0 else 1 end
    end;
    -- Pontos e voucher saem da base no modo PAGAMENTO sempre; no ATENDIMENTO,
    -- só se a rede escolheu "sobre o valor pago".
    if not (v_l.modo = 'PAGAMENTO' or v_l.base_com_pontos = 'VALOR_PAGO') then
      v_desconto := 0;
    end if;

  elsif v_l.origem = 'PLANO' then
    select coalesce(sum(p.price), 0) into v_total
      from public.treatment_plan_sessions s
      join public.treatment_plan_session_procedures p on p.session_id = s.id
     where s.plan_id = v_l.treatment_plan_id;
    -- O que o plano recebeu de verdade: receita paga, sem estorno.
    select coalesce(sum(f.amount), 0),
           case when coalesce(sum(f.amount), 0) > 0 then
             sum(f.amount * private.comissao_taxa_pct(v_l.tenant_id, f.payment_method::text,
                   coalesce((select max(i.total) from public.installments i where i.transaction_id = f.id), 1)))
             / sum(f.amount)
           else 0 end
      into v_recebido, v_taxa
      from public.financial_transactions f
     where f.treatment_plan_id = v_l.treatment_plan_id
       and f.type = 'INCOME' and f.is_paid
       and coalesce(f.notes, '') <> 'Estornada' and f.category <> 'Estorno';
    if v_l.modo = 'PAGAMENTO' then
      v_fracao := case when v_total <= 0 then 1 else least(1, v_recebido / v_total) end;
    end if;

  else
    -- Pacote: pago na venda (o sistema não registra quanto nem como).
    v_fracao := 1;
  end if;

  if v_l.regra_tipo = 'FIXED_AMOUNT' then
    -- Valor fixo é fixo: os descontos da base só mexem no percentual.
    -- (Revisto em 20260930000012: pontos e voucher o reduzem na proporção.)
    v_valor := v_l.regra_valor;
  else
    v_base := v_l.preco - least(v_desconto, v_l.preco);
    if v_l.desconta_taxa then
      v_base := v_base - round(v_base * v_taxa / 100, 2);
    end if;
    if v_l.desconta_insumos then
      v_base := v_base - v_l.custo_insumos;
    end if;
    v_valor := round(greatest(v_base, 0) * v_l.regra_valor / 100, 2);
  end if;

  return round(v_valor * v_fracao, 2);
end $$;

-- ─── Lança a diferença entre o devido e o já lançado ─────────────────────────
create or replace function private.comissao_acertar_linha(p_linha uuid, p_motivo text, p_transacao uuid)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_l       public.commission_lines%rowtype;
  v_alvo    numeric;
  v_lancado numeric;
  v_delta   numeric;
begin
  -- Dois acertos da mesma linha ao mesmo tempo lançariam a diferença duas vezes.
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
    );
  end if;
  return v_delta;
end $$;

-- ─── Recebimento e estorno acertam as linhas do atendimento ou do plano ──────
create or replace function private.comissoes_do_pagamento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_motivo text;
  v_linha  uuid;
begin
  if new.appointment_id is null and new.treatment_plan_id is null then
    return new;
  end if;
  v_motivo := case
    when tg_op = 'UPDATE' and coalesce(new.notes, '') = 'Estornada' and coalesce(old.notes, '') <> 'Estornada'
      then 'Estorno do pagamento'
    when new.treatment_plan_id is not null then 'Recebimento do plano'
    else 'Pagamento recebido'
  end;
  for v_linha in
    select cl.id from public.commission_lines cl
     where (new.appointment_id is not null and cl.appointment_id = new.appointment_id)
        or (new.treatment_plan_id is not null and cl.treatment_plan_id = new.treatment_plan_id)
     order by cl.created_at, cl.item
  loop
    perform private.comissao_acertar_linha(v_linha, v_motivo, new.id);
  end loop;
  return new;
end $$;

create trigger trg_comissoes_do_pagamento
  after insert or update of is_paid, notes, amount, payment_method, loyalty_discount
  on public.financial_transactions
  for each row execute function private.comissoes_do_pagamento();

-- ─── Atendimento concluído não se cancela ────────────────────────────────────
-- Concluído tem prontuário, baixa de estoque e comissão: cancelar ou marcar
-- falta deixaria os três pendurados num atendimento que "não aconteceu". Para
-- desfazer o dinheiro, estorna-se o pagamento.
create or replace function private.atendimento_concluido_nao_cancela()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'COMPLETED' and new.status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'Atendimento concluído não pode ser cancelado nem marcado como falta. Para devolver o dinheiro, estorne o pagamento.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger trg_atendimento_concluido_nao_cancela
  before update of status on public.appointments
  for each row execute function private.atendimento_concluido_nao_cancela();

-- ─── A conclusão grava as linhas e o primeiro acerto ─────────────────────────
create or replace function public.concluir_atendimento(p_agendamento uuid, p_tenant uuid, p_ator uuid, p_ator_nome text, p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = 'public'
as $function$
declare
  v_status     text;
  v_unidade    uuid;
  v_cliente    uuid;
  v_prof       uuid;
  v_rede       uuid;
  v_proc       uuid;
  v_preco_ag   numeric;
  v_plano      uuid;
  v_prontuario uuid;
  v_insumo     jsonb;
  v_sessao     uuid;
  v_pacote     uuid;
  v_linhas     jsonb := p_dados -> 'comissoes';
  v_linha      jsonb;
  v_cfg        public.commission_configs%rowtype;
  v_custo      numeric;
  v_soma_preco numeric;
  v_id         uuid;
  v_ids        uuid[] := '{}';
  v_item       int := 0;
begin
  select a.status::text, a.branch_id, a.client_id, a.professional_id, b.tenant_id, a.procedure_id, a.price, a.treatment_plan_id
    into v_status, v_unidade, v_cliente, v_prof, v_rede, v_proc, v_preco_ag, v_plano
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'Atendimento já concluído.' using errcode = 'invalid_parameter_value';
  end if;
  if v_status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'Agendamento já finalizado.' using errcode = 'invalid_parameter_value';
  end if;

  update public.appointments
  set status = 'COMPLETED', completed_at = now()
  where id = p_agendamento;

  select id into v_prontuario from public.medical_records where client_id = v_cliente;
  if v_prontuario is null then
    insert into public.medical_records (client_id) values (v_cliente) returning id into v_prontuario;
  end if;

  insert into public.medical_record_entries
    (medical_record_id, appointment_id, professional_id, notes, intercurrences)
  values
    (v_prontuario, p_agendamento, v_prof, p_dados ->> 'notas', p_dados ->> 'intercorrencias')
  on conflict (appointment_id) do update
    set medical_record_id = excluded.medical_record_id,
        professional_id   = excluded.professional_id,
        notes             = excluded.notes,
        intercurrences    = excluded.intercurrences;

  for v_insumo in select * from jsonb_array_elements(coalesce(p_dados -> 'insumos', '[]'::jsonb))
  loop
    insert into public.stock_movements
      (branch_id, product_id, type, quantity, balance_after, appointment_id, created_by, unit_cost)
    values (
      v_unidade,
      (v_insumo ->> 'produto')::uuid,
      'PROCEDURE_USAGE',
      (v_insumo ->> 'quantidade')::numeric,
      (v_insumo ->> 'saldo_apos')::numeric,
      p_agendamento,
      coalesce(p_ator::text, 'sistema'),
      (v_insumo ->> 'custo')::numeric
    );

    insert into public.branch_product_stock
      (product_id, branch_id, current_stock, current_rendimento, min_stock, updated_at)
    values (
      (v_insumo ->> 'produto')::uuid, v_unidade,
      (v_insumo ->> 'embalagens')::numeric,
      (v_insumo ->> 'rendimento')::numeric,
      coalesce((v_insumo ->> 'minimo')::numeric, 0),
      now()
    )
    on conflict (product_id, branch_id) do update
      set current_stock      = excluded.current_stock,
          current_rendimento = excluded.current_rendimento,
          updated_at         = excluded.updated_at;
  end loop;

  select id, client_package_id into v_sessao, v_pacote
  from public.package_sessions
  where appointment_id = p_agendamento
  for update;
  if v_sessao is not null then
    update public.package_sessions set status = 'USED', used_at = now() where id = v_sessao;
    update public.client_packages set used_sessions = used_sessions + 1 where id = v_pacote;
  end if;

  -- Compatibilidade com o finishSession de antes do deploy: uma comissão só,
  -- sobre o preço do atendimento.
  if v_linhas is null and jsonb_typeof(p_dados -> 'comissao') = 'object' then
    v_linhas := jsonb_build_array(jsonb_build_object(
      'procedure_id', v_proc,
      'origem', case when v_plano is not null then 'PLANO' when v_pacote is not null then 'PACOTE' else 'AVULSO' end,
      'treatment_plan_id', v_plano,
      'regra_tipo', p_dados -> 'comissao' ->> 'tipo',
      'regra_valor', (p_dados -> 'comissao' ->> 'regra')::numeric,
      'preco', coalesce(v_preco_ag, 0)
    ));
  end if;

  if v_linhas is not null and jsonb_typeof(v_linhas) = 'array' and jsonb_array_length(v_linhas) > 0 then
    select * into v_cfg from public.commission_configs c where c.tenant_id = p_tenant;
    if not found then
      v_cfg.modo := 'ATENDIMENTO'; v_cfg.desconta_insumos := false; v_cfg.desconta_taxa := false;
      v_cfg.base_com_pontos := 'PRECO';
    end if;
    -- O custo dos insumos: a mesma conta de metrics_giro_estoque, sobre os
    -- movimentos que esta transação acabou de gravar.
    select coalesce(sum(abs(m.quantity) * coalesce(m.unit_cost, p.cost_price, 0)), 0) into v_custo
      from public.stock_movements m
      left join public.products p on p.id = m.product_id
     where m.appointment_id = p_agendamento and m.type = 'PROCEDURE_USAGE';
    select coalesce(sum((l ->> 'preco')::numeric), 0) into v_soma_preco from jsonb_array_elements(v_linhas) l;

    for v_linha in select * from jsonb_array_elements(v_linhas)
    loop
      insert into public.commission_lines
        (tenant_id, branch_id, appointment_id, item, procedure_id, professional_id, origem, treatment_plan_id,
         regra_tipo, regra_valor, modo, desconta_insumos, desconta_taxa, base_com_pontos, preco, custo_insumos)
      values (
        p_tenant, v_unidade, p_agendamento, v_item,
        nullif(v_linha ->> 'procedure_id', '')::uuid, v_prof,
        v_linha ->> 'origem', nullif(v_linha ->> 'treatment_plan_id', '')::uuid,
        (v_linha ->> 'regra_tipo')::public."CommissionType", (v_linha ->> 'regra_valor')::numeric,
        v_cfg.modo, v_cfg.desconta_insumos, v_cfg.desconta_taxa, v_cfg.base_com_pontos,
        round((v_linha ->> 'preco')::numeric, 2),
        case when v_soma_preco > 0 then round(v_custo * (v_linha ->> 'preco')::numeric / v_soma_preco, 2)
             else round(v_custo / jsonb_array_length(v_linhas), 2) end
      )
      on conflict (appointment_id, item) do nothing
      returning id into v_id;
      if v_id is not null then
        v_ids := v_ids || v_id;
        perform private.comissao_acertar_linha(v_id, 'Atendimento concluído', null);
      end if;
      v_item := v_item + 1;
      v_id := null;
    end loop;
  end if;

  if p_ator is not null then
    insert into public.appointment_history
      (appointment_id, changed_by_id, changed_by_name, action, description)
    values (p_agendamento, p_ator, coalesce(p_ator_nome, 'Usuário'), 'COMPLETED', 'Atendimento concluído pelo profissional');
  end if;

  return jsonb_build_object(
    'comissao_criada', coalesce(array_length(v_ids, 1), 0) > 0,
    'pacote', v_pacote,
    'comissoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'linha', cl.id, 'procedure_id', cl.procedure_id,
               'liberado', (select coalesce(sum(c.amount), 0) from public.commissions c where c.line_id = cl.id)
             ) order by cl.item), '[]'::jsonb)
        from public.commission_lines cl where cl.id = any (v_ids)
    )
  );
end
$function$;

-- ─── O pagamento do atendimento deixa a comissão para o gatilho ──────────────
-- Igual à de antes, menos o bloco que reescalava a comissão pelo
-- `loyalty_configs.commission_base`: agora o gatilho do pagamento acerta a
-- linha, com a base da configuração de comissões retratada na conclusão.
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
  v_metodo    text    := nullif(trim(coalesce(p_dados ->> 'metodo', '')), '');
  v_pontos    int     := coalesce((p_dados ->> 'pontos')::int, 0);
  v_desconto  numeric := round(coalesce((p_dados ->> 'desconto')::numeric, 0), 2);
  v_final     numeric := round(coalesce((p_dados ->> 'valor_final')::numeric, -1), 2);
  v_vid       uuid    := nullif(p_dados ->> 'voucher_id', '')::uuid;
  v_dv        numeric := round(coalesce((p_dados ->> 'desconto_voucher')::numeric, 0), 2);
  v_voucher   public.loyalty_vouchers%rowtype;
  v_esperado  numeric;
  v_base      numeric;
  v_cfg       public.loyalty_configs%rowtype;
  v_saldo     int;
  v_tx        uuid;
  v_pago      boolean;
  v_agora     timestamptz := now();
  v_descricao text;
begin
  select a.status::text, a.branch_id, a.client_id, a.price, a.treatment_plan_id, a.procedure_id, b.tenant_id
    into v_status, v_unidade, v_cliente, v_preco, v_plano, v_proc, v_rede
  from public.appointments a
  join public.branches b on b.id = a.branch_id
  where a.id = p_agendamento
  for update of a;

  if not found or v_rede is distinct from p_tenant then
    raise exception 'Agendamento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'COMPLETED' then
    raise exception 'O atendimento precisa estar concluído para confirmar pagamento.' using errcode = 'P0001';
  end if;
  if v_plano is not null then
    raise exception 'Sessão de plano de tratamento: o pagamento é recebido no plano, não no atendimento.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.package_sessions ps where ps.appointment_id = p_agendamento) then
    raise exception 'Sessão de pacote: já foi paga na venda do pacote.' using errcode = 'P0001';
  end if;

  if v_pontos < 0 or v_desconto < 0 or v_final < 0 or v_dv < 0 then
    raise exception 'Valores do pagamento inválidos.' using errcode = 'P0001';
  end if;
  if v_final + v_desconto + v_dv <> round(v_preco, 2) then
    raise exception 'O valor recebido mais os descontos não fecham com o preço do atendimento.' using errcode = 'P0001';
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
    v_esperado := case v_voucher.type
      when 'PROCEDIMENTO' then
        case when v_voucher.procedure_id = v_proc then round(v_preco, 2) else null end
      when 'DESCONTO_VALOR'      then least(v_voucher.discount_value, round(v_preco, 2))
      when 'DESCONTO_PERCENTUAL' then round(v_preco * v_voucher.discount_value / 100, 2)
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

  v_base := round(v_preco, 2) - v_dv;
  if v_pontos > 0 then
    if v_pontos < v_cfg.redeem_min_points then
      raise exception 'O mínimo para usar pontos é % pontos.', v_cfg.redeem_min_points using errcode = 'P0001';
    end if;
    if v_desconto <> least(round(v_pontos * v_cfg.redeem_points_value, 2), v_base) then
      raise exception 'O desconto não corresponde aos pontos usados.' using errcode = 'P0001';
    end if;
    if v_desconto > round(v_base * v_cfg.redeem_max_pct / 100, 2) then
      raise exception 'Os pontos pagam no máximo % %% do atendimento.',
        trim(to_char(v_cfg.redeem_max_pct, 'FM990D##')) using errcode = 'P0001';
    end if;
    v_saldo := public.saldo_de_pontos(v_cliente, case when v_cfg.scope_per_branch then v_unidade else null end);
    if v_saldo < v_pontos then
      raise exception 'Saldo de pontos insuficiente: o cliente tem % pontos.', greatest(v_saldo, 0) using errcode = 'P0001';
    end if;
  end if;

  select f.id, f.is_paid into v_tx, v_pago
    from public.financial_transactions f
   where f.appointment_id = p_agendamento
   for update;

  if v_pago then
    raise exception 'Pagamento já registrado para este atendimento.' using errcode = 'P0001';
  end if;

  if v_tx is not null then
    update public.financial_transactions
       set amount           = v_final,
           loyalty_discount = v_desconto + v_dv,
           payment_method   = v_metodo::public."PaymentMethod",
           is_paid          = true,
           paid_at          = v_agora,
           updated_at       = v_agora
     where id = v_tx;
  else
    insert into public.financial_transactions (
      branch_id, appointment_id, client_id, type, category, description,
      amount, loyalty_discount, payment_method, is_paid, paid_at, created_by
    ) values (
      v_unidade, p_agendamento, v_cliente, 'INCOME', 'Serviços', 'Atendimento concluído',
      v_final, v_desconto + v_dv, v_metodo::public."PaymentMethod", true, v_agora,
      coalesce(p_ator::text, 'sistema')
    )
    returning id into v_tx;
  end if;

  if v_vid is not null then
    update public.loyalty_vouchers
       set status = 'USADO', used_at = v_agora, used_transaction_id = v_tx
     where id = v_vid;
  end if;

  if v_pontos > 0 then
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description,
      transaction_id, appointment_id, created_by
    ) values (
      public.fidelidade_conta(v_cliente), v_unidade, 'RESGATE', -v_pontos,
      'Desconto no pagamento: R$ ' || replace(to_char(v_desconto, 'FM999999990.00'), '.', ','),
      v_tx, p_agendamento, coalesce(p_ator::text, 'sistema')
    );
  end if;

  if p_ator is not null then
    v_descricao := 'Pagamento confirmado' || coalesce(' via ' || v_metodo, '');
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

revoke execute on function public.concluir_atendimento(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.concluir_atendimento(uuid, uuid, uuid, text, jsonb) to service_role;

revoke execute on function private.comissao_taxa_pct(uuid, text, int) from public, anon, authenticated;
revoke execute on function private.comissao_alvo(uuid) from public, anon, authenticated;
revoke execute on function private.comissao_acertar_linha(uuid, text, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
