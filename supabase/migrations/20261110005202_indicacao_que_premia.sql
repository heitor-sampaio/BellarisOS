-- A indicação que premia (A43 da 10ª simulação e o caso da Ana Clara e da
-- Marina; decisão do Heitor, 2026-11-10: "1 - sim").
--
-- 1. "Indicada por" é um VÍNCULO com outra ficha da mesma clínica
--    (`clients.indicada_por`), não um texto. O texto livre da importação
--    (`referred_by`) fica para o nome que não bateu com ficha nenhuma.
-- 2. Em Fidelidade, o "Prêmio por indicação" NASCE DESLIGADO (princípio 6):
--    N pontos ou uma recompensa do catálogo para QUEM INDICOU
--    (`loyalty_configs.indicacao_premio`, `_pontos`, `_recompensa_id`).
-- 3. O prêmio sai quando a indicada PAGA o primeiro atendimento ou a primeira
--    venda (princípio 5: sem dinheiro, sem prêmio) — o primeiro pagamento que
--    vale: receita paga, com dinheiro (não o crédito interno, não o pago todo
--    com pontos), que não é estorno nem foi estornada. Uma vez por indicada
--    (`indicacao_premios`, um ativo por indicada). Pagamento de antes da
--    indicação ou de antes da regra conta como o primeiro: nunca retroativo.
-- 4. O estorno desse pagamento tira o prêmio, como tira os pontos do
--    pagamento: os pontos voltam num ESTORNO_GANHO (com o vencimento do
--    prêmio), o voucher ainda não usado é cancelado. Se a indicada ainda tem
--    outro pagamento que vale, o prêmio passa para o primeiro deles (ela pagou;
--    o prêmio acompanha o primeiro pagamento que ficou).
-- Quem dá é o banco, por gatilho no pagamento — o mesmo argumento do ponto:
-- receita paga nasce em vários lugares do código.

-- 1. O vínculo ---------------------------------------------------------------
alter table public.clients add column if not exists indicada_por uuid references public.clients(id) on delete set null;
create index if not exists clients_indicada_por_idx on public.clients (indicada_por) where indicada_por is not null;

-- Da mesma clínica, e nunca a própria ficha.
create or replace function private.indicada_por_confere()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.indicada_por is null then return new; end if;
  if new.indicada_por = new.id then
    raise exception 'Uma ficha não pode ser indicada por ela mesma.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clients c where c.id = new.indicada_por and c.tenant_id = new.tenant_id) then
    raise exception 'A ficha de quem indicou é de outra clínica.' using errcode = 'P0001';
  end if;
  return new;
end $function$;

create or replace trigger trg_indicada_por_confere
  before insert or update of indicada_por on public.clients
  for each row execute function private.indicada_por_confere();

-- 2. A regra da clínica ------------------------------------------------------
alter table public.loyalty_configs
  add column if not exists indicacao_premio text not null default 'DESLIGADO'
    check (indicacao_premio in ('DESLIGADO', 'PONTOS', 'RECOMPENSA')),
  add column if not exists indicacao_pontos int not null default 0
    check (indicacao_pontos >= 0 and indicacao_pontos <= 1000000),
  add column if not exists indicacao_recompensa_id uuid references public.loyalty_rewards(id);

-- 3. O prêmio dado ------------------------------------------------------------
-- Sem chave estrangeira para o pagamento, o lançamento e o voucher, de
-- propósito: tabela com chave para duas tabelas é lida pelo PostgREST como
-- junção (CLAUDE.md §14), e o que importa aqui é a indicada.
create table if not exists public.indicacao_premios (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id),
  indicada_id             uuid not null references public.clients(id) on delete cascade,
  indicadora_id           uuid not null references public.clients(id) on delete cascade,
  branch_id               uuid not null,
  transaction_id          uuid not null,
  tipo                    text not null check (tipo in ('PONTOS', 'RECOMPENSA')),
  pontos                  int,
  loyalty_transaction_id  uuid,
  voucher_id              uuid,
  created_at              timestamptz not null default now(),
  estornado_em            timestamptz
);
create unique index if not exists indicacao_premios_um_por_indicada
  on public.indicacao_premios (indicada_id) where estornado_em is null;
create index if not exists indicacao_premios_indicadora_idx on public.indicacao_premios (indicadora_id);
create index if not exists indicacao_premios_transacao_idx on public.indicacao_premios (transaction_id);
create index if not exists indicacao_premios_tenant_idx on public.indicacao_premios (tenant_id);

-- Só o servidor lê e escreve (nenhuma política permissiva); as restritivas do suporte, como toda tabela.
alter table public.indicacao_premios enable row level security;
create policy suporte_sem_escrita_ins on public.indicacao_premios as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.indicacao_premios as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end) with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.indicacao_premios as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- O pagamento que vale para o prêmio: dinheiro que entrou e ficou.
create or replace function private.indicacao_pagamento_que_vale(f public.financial_transactions)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select f.client_id is not null
     and f.type = 'INCOME'
     and coalesce(f.is_paid, false)
     and f.category is distinct from 'Estorno'
     and coalesce(f.notes, '') <> 'Estornada'
     and f.amount > 0
     and f.payment_method is distinct from 'INTERNAL_CREDIT'
$function$;

-- Dá o prêmio pela indicação, se este pagamento é o primeiro que vale da indicada.
create or replace function private.indicacao_premiar(p_transacao uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tx         public.financial_transactions%rowtype;
  v_rede       uuid;
  v_cfg        public.loyalty_configs%rowtype;
  v_indicadora uuid;
  v_nome       text;
  v_rec        public.loyalty_rewards%rowtype;
  v_premio     uuid;
  v_lanc       uuid;
  v_voucher    uuid;
begin
  select * into v_tx from public.financial_transactions t where t.id = p_transacao;
  if not found or not private.indicacao_pagamento_que_vale(v_tx) then return; end if;

  select b.tenant_id into v_rede from public.branches b where b.id = v_tx.branch_id;
  if v_rede is null then return; end if;
  select * into v_cfg from public.loyalty_configs c where c.tenant_id = v_rede and c.enabled;
  if not found or v_cfg.indicacao_premio = 'DESLIGADO' then return; end if;
  -- A fidelidade é do PLANO da rede (lib/planos/recursos.ts).
  if not private.rede_tem_recurso(v_rede, 'fidelidade') then return; end if;

  select c.indicada_por, c.name into v_indicadora, v_nome
    from public.clients c where c.id = v_tx.client_id and c.tenant_id = v_rede;
  if v_indicadora is null then return; end if;

  -- Uma vez por indicada: a trava dela, e o prêmio ativo que já existe.
  perform pg_advisory_xact_lock(hashtext('indicacao:' || v_tx.client_id::text));
  if exists (select 1 from public.indicacao_premios p where p.indicada_id = v_tx.client_id and p.estornado_em is null) then
    return;
  end if;
  -- O PRIMEIRO pagamento que vale: um anterior que vale (até de antes da
  -- indicação ou da regra) já foi o primeiro — nunca retroativo.
  if exists (
    select 1 from public.financial_transactions f
     where f.client_id = v_tx.client_id and f.id <> v_tx.id
       and private.indicacao_pagamento_que_vale(f)
       and (coalesce(f.paid_at, f.created_at), f.id) < (coalesce(v_tx.paid_at, v_tx.created_at), v_tx.id)
  ) then
    return;
  end if;

  if v_cfg.indicacao_premio = 'PONTOS' then
    if coalesce(v_cfg.indicacao_pontos, 0) <= 0 then return; end if;
  else
    select * into v_rec from public.loyalty_rewards r
     where r.id = v_cfg.indicacao_recompensa_id and r.tenant_id = v_rede and r.is_active;
    if not found then return; end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_indicadora::text));

  insert into public.indicacao_premios (tenant_id, indicada_id, indicadora_id, branch_id, transaction_id, tipo, pontos)
  values (v_rede, v_tx.client_id, v_indicadora, v_tx.branch_id, v_tx.id, v_cfg.indicacao_premio,
          case when v_cfg.indicacao_premio = 'PONTOS' then v_cfg.indicacao_pontos end)
  returning id into v_premio;

  if v_cfg.indicacao_premio = 'PONTOS' then
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description, expires_at, created_by, bonus_ref
    ) values (
      public.fidelidade_conta(v_indicadora), v_tx.branch_id, 'BONUS', v_cfg.indicacao_pontos,
      'Indicação de ' || v_nome,
      case when v_cfg.expiry_months is null then null
           else coalesce(v_tx.paid_at, now()) + make_interval(months => v_cfg.expiry_months) end,
      'sistema', 'INDICACAO:' || v_premio
    ) returning id into v_lanc;
    update public.indicacao_premios set loyalty_transaction_id = v_lanc where id = v_premio;
  else
    -- A recompensa sai como um voucher sem custo de pontos (o retrato da recompensa, como na troca).
    insert into public.loyalty_vouchers (
      tenant_id, client_id, branch_id, reward_id, type, name, procedure_id, product_id,
      discount_value, points_cost, expires_at, created_by
    ) values (
      v_rede, v_indicadora, v_tx.branch_id, v_rec.id, v_rec.type, v_rec.name, v_rec.procedure_id, v_rec.product_id,
      v_rec.discount_value, 0, now() + make_interval(days => v_rec.validity_days), 'sistema'
    ) returning id into v_voucher;
    update public.indicacao_premios set voucher_id = v_voucher where id = v_premio;
  end if;
end $function$;

-- O pagamento pago: o prêmio, se é o primeiro da indicada.
create or replace function private.fidelidade_premio_da_indicacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(new.is_paid, false) then return null; end if;
  if tg_op = 'UPDATE' and coalesce(old.is_paid, false) then return null; end if;
  if new.client_id is null or new.type <> 'INCOME' then return null; end if;
  perform private.indicacao_premiar(new.id);
  return null;
end $function$;

create or replace trigger trg_fidelidade_indicacao
  after insert or update of is_paid on public.financial_transactions
  for each row execute function private.fidelidade_premio_da_indicacao();

-- O estorno do pagamento que premiou: o prêmio sai junto.
create or replace function private.fidelidade_estorno_da_indicacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_p     public.indicacao_premios%rowtype;
  v_l     public.loyalty_transactions%rowtype;
  v_nome  text;
  v_outro uuid;
begin
  if coalesce(new.notes, '') <> 'Estornada' or coalesce(old.notes, '') = 'Estornada' then return null; end if;

  for v_p in
    select * from public.indicacao_premios p
     where p.transaction_id = new.id and p.estornado_em is null
     for update
  loop
    perform pg_advisory_xact_lock(hashtext('indicacao:' || v_p.indicada_id::text));
    perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_p.indicadora_id::text));
    select c.name into v_nome from public.clients c where c.id = v_p.indicada_id;

    if v_p.voucher_id is not null then
      update public.loyalty_vouchers
         set status = 'CANCELADO', cancel_reason = 'O pagamento da indicada foi estornado.', cancelled_by = 'sistema'
       where id = v_p.voucher_id and status = 'ATIVO';
      -- O voucher já usado não volta: o prêmio fica como foi.
      if not found then continue; end if;
    end if;

    if v_p.loyalty_transaction_id is not null then
      select * into v_l from public.loyalty_transactions l where l.id = v_p.loyalty_transaction_id;
      if found then
        insert into public.loyalty_transactions (
          loyalty_account_id, branch_id, kind, points, description, expires_at, created_by, bonus_ref
        ) values (
          v_l.loyalty_account_id, v_l.branch_id, 'ESTORNO_GANHO', -v_l.points,
          'Estorno da indicação de ' || coalesce(v_nome, 'cliente') || ' (o pagamento dela foi estornado)',
          v_l.expires_at, 'sistema', 'ESTORNO_INDICACAO:' || v_p.id
        );
      end if;
    end if;

    update public.indicacao_premios set estornado_em = now() where id = v_p.id;

    -- Ela ainda tem um pagamento que vale: o prêmio passa para o primeiro deles.
    select f.id into v_outro
      from public.financial_transactions f
     where f.client_id = v_p.indicada_id and f.id <> new.id
       and private.indicacao_pagamento_que_vale(f)
     order by coalesce(f.paid_at, f.created_at), f.id
     limit 1;
    if v_outro is not null then
      perform private.indicacao_premiar(v_outro);
    end if;
  end loop;

  return null;
end $function$;

create or replace trigger trg_fidelidade_estorno_da_indicacao
  after update of notes on public.financial_transactions
  for each row execute function private.fidelidade_estorno_da_indicacao();

-- O voucher do prêmio não custou pontos: cancelá-lo não devolve nada (o
-- lançamento de 0 pontos seria recusado pelo banco).
create or replace function public.cancelar_voucher(p_tenant uuid, p_voucher uuid, p_ator text, p_motivo text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_v     public.loyalty_vouchers%rowtype;
  v_meses int;
begin
  select * into v_v from public.loyalty_vouchers v where v.id = p_voucher for update;
  if not found or v_v.tenant_id is distinct from p_tenant then
    raise exception 'Voucher não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_v.status <> 'ATIVO' then
    raise exception 'Só um voucher ativo pode ser cancelado.' using errcode = 'P0001';
  end if;
  if v_v.expires_at <= now() then
    raise exception 'Voucher vencido: os pontos não voltam.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'O motivo do cancelamento é obrigatório.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('fidelidade:' || v_v.client_id::text));

  update public.loyalty_vouchers
     set status = 'CANCELADO', cancel_reason = trim(p_motivo), cancelled_by = p_ator
   where id = p_voucher;

  if coalesce(v_v.points_cost, 0) > 0 then
    select c.expiry_months into v_meses from public.loyalty_configs c where c.tenant_id = p_tenant;
    insert into public.loyalty_transactions (
      loyalty_account_id, branch_id, kind, points, description, voucher_id, expires_at, created_by
    ) values (
      public.fidelidade_conta(v_v.client_id), v_v.branch_id, 'VOUCHER_CANCELADO', v_v.points_cost,
      'Voucher cancelado: ' || v_v.name || ' — ' || trim(p_motivo), p_voucher,
      case when v_meses is null then null else now() + make_interval(months => v_meses) end,
      p_ator
    );
  end if;
end;
$function$;

-- A importação liga pelo nome (sem caixa, acento nem espaço a mais): as fichas ATIVAS com esse nome.
create or replace function public.fichas_pelo_nome(p_tenant uuid, p_nome text)
returns table(id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.id, c.name
    from public.clients c
   where c.tenant_id = p_tenant and c.is_active
     and private.sem_acento(regexp_replace(trim(c.name), '\s+', ' ', 'g'))
       = private.sem_acento(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'))
   order by c.created_at, c.id
   limit 5
$function$;

revoke execute on function public.fichas_pelo_nome(uuid, text) from public, anon, authenticated;
grant execute on function public.fichas_pelo_nome(uuid, text) to service_role;

notify pgrst, 'reload schema';
