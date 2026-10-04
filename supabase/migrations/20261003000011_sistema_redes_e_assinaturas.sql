-- Central de administração do sistema (/sistema): a situação da rede, os
-- planos, a assinatura e a cobrança pelo Asaas (2026-10-03).
--
-- A rede BLOQUEADA é uma regra só (private.rede_bloqueada e
-- lib/redes/situacao.ts): desligada à mão (`is_active = false`, que a
-- cobrança nunca desfaz) OU com a assinatura suspensa/cancelada
-- (`plan_status`, que a cobrança escreve e desfaz sozinha).
--
-- Tudo daqui é da plataforma: RLS ligada e ZERO políticas, funções só do
-- service_role (como credencial e como o resto da plataforma).

-- 1. A situação da rede -------------------------------------------------------
alter table public.tenants
  drop constraint if exists tenants_plan_status_check,
  add constraint tenants_plan_status_check
    check (plan_status in ('trial', 'active', 'past_due', 'suspended', 'canceled'));
alter table public.tenants
  add column if not exists em_atraso_desde date,
  add column if not exists desligada_motivo text,
  add column if not exists desligada_em timestamptz;
comment on column public.tenants.is_active is
  'Desligamento MANUAL pela plataforma (abuso, pedido): só o admin religa. A cobrança mexe em plan_status, nunca aqui.';
comment on column public.tenants.em_atraso_desde is
  'Desde quando a rede está em atraso (fim do teste ou o vencimento mais antigo em aberto). Conta a carência.';

create or replace function private.rede_bloqueada(p_tenant uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select not t.is_active or t.plan_status in ('suspended', 'canceled')
                      from public.tenants t where t.id = p_tenant), false)
$$;

-- 2. Planos e configuração ----------------------------------------------------
create table if not exists public.platform_plans (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (length(trim(nome)) between 2 and 60),
  descricao       text check (length(descricao) <= 500),
  valor_centavos  integer not null check (valor_centavos >= 0),
  ativo           boolean not null default true,
  ordem           integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists platform_plans_nome on public.platform_plans (lower(nome));
alter table public.platform_plans enable row level security;

create table if not exists public.platform_settings (
  id                int primary key default 1 check (id = 1),
  dias_de_teste     int not null default 14 check (dias_de_teste between 0 and 90),
  dias_de_carencia  int not null default 7 check (dias_de_carencia between 0 and 60),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.platform_staff(id) on delete set null
);
alter table public.platform_settings enable row level security;
insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

-- 3. Assinatura (uma por rede) e as faturas do Asaas --------------------------
create table if not exists public.tenant_subscriptions (
  tenant_id              uuid primary key references public.tenants(id) on delete cascade,
  plan_id                uuid references public.platform_plans(id) on delete set null,
  -- RETRATO do valor: o catálogo pode mudar; o combinado com a rede, não.
  -- Também é o "preço especial".
  valor_centavos         integer not null check (valor_centavos >= 0),
  asaas_customer_id      text,
  asaas_subscription_id  text unique,
  cobranca               text not null default 'sem_cobranca'
                         check (cobranca in ('sem_cobranca', 'ativa', 'cancelada')),
  proximo_vencimento     date,
  cancelada_em           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
alter table public.tenant_subscriptions enable row level security;

create table if not exists public.subscription_invoices (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  asaas_payment_id       text not null unique,
  asaas_subscription_id  text,
  valor_centavos         integer not null,
  vencimento             date not null,
  -- O status do Asaas como veio (PENDING, OVERDUE, RECEIVED, CONFIRMED, …).
  situacao               text not null,
  pago_em                timestamptz,
  invoice_url            text,
  removida               boolean not null default false,
  updated_at             timestamptz not null default now()
);
create index if not exists subscription_invoices_rede on public.subscription_invoices (tenant_id, vencimento desc);
alter table public.subscription_invoices enable row level security;

-- Os eventos do webhook, pela chave do Asaas: a entrega é "pelo menos uma
-- vez", e o repetido bate no 23505.
create table if not exists public.asaas_events (
  id             text primary key,
  evento         text not null,
  payload        jsonb not null,
  recebido_em    timestamptz not null default now(),
  processado_em  timestamptz,
  tentativas     int not null default 0,
  erro           text
);
create index if not exists asaas_events_pendentes on public.asaas_events (recebido_em) where processado_em is null;
alter table public.asaas_events enable row level security;

-- 4. A cobrança muda a situação: POR ESTADO, não por evento -----------------
-- Os eventos podem chegar fora de ordem e repetidos; a situação é recalculada
-- do que as faturas dizem agora. Em atraso = fatura em aberto (não paga, não
-- removida) com vencimento já passado.
create or replace function public.assinatura_aplicar_cobranca(p_payment jsonb, p_evento text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_sub      public.tenant_subscriptions;
  v_tenant   public.tenants;
  v_pago     boolean;
  v_atraso   date;
  v_novo     text;
begin
  select * into v_sub from public.tenant_subscriptions
   where asaas_subscription_id = p_payment ->> 'subscription'
      or (p_payment ->> 'subscription' is null and asaas_customer_id = p_payment ->> 'customer')
   limit 1
   for update;
  if not found then return jsonb_build_object('ignorado', 'assinatura desconhecida'); end if;

  select * into v_tenant from public.tenants where id = v_sub.tenant_id for update;

  insert into public.subscription_invoices
    (tenant_id, asaas_payment_id, asaas_subscription_id, valor_centavos, vencimento, situacao, pago_em, invoice_url, removida, updated_at)
  values (
    v_sub.tenant_id, p_payment ->> 'id', p_payment ->> 'subscription',
    round(coalesce((p_payment ->> 'value')::numeric, 0) * 100)::int,
    (p_payment ->> 'dueDate')::date,
    coalesce(p_payment ->> 'status', 'PENDING'),
    case when p_payment ->> 'paymentDate' is not null then (p_payment ->> 'paymentDate')::date::timestamptz
         when p_payment ->> 'clientPaymentDate' is not null then (p_payment ->> 'clientPaymentDate')::date::timestamptz end,
    p_payment ->> 'invoiceUrl',
    coalesce((p_payment ->> 'deleted')::boolean, false) or p_evento = 'PAYMENT_DELETED',
    now())
  on conflict (asaas_payment_id) do update set
    valor_centavos = excluded.valor_centavos,
    vencimento     = excluded.vencimento,
    situacao       = excluded.situacao,
    pago_em        = coalesce(excluded.pago_em, public.subscription_invoices.pago_em),
    invoice_url    = coalesce(excluded.invoice_url, public.subscription_invoices.invoice_url),
    removida       = excluded.removida,
    updated_at     = now();

  v_pago := p_evento in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')
         or coalesce(p_payment ->> 'status', '') in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH');

  select min(i.vencimento) into v_atraso
    from public.subscription_invoices i
   where i.tenant_id = v_sub.tenant_id and not i.removida
     and i.situacao in ('PENDING', 'OVERDUE') and i.vencimento < (now() at time zone 'America/Sao_Paulo')::date;

  v_novo := v_tenant.plan_status;
  if v_tenant.plan_status = 'canceled' then
    v_novo := 'canceled';
  elsif v_atraso is not null then
    if v_tenant.plan_status in ('trial', 'active') then v_novo := 'past_due'; end if;
  elsif v_tenant.plan_status in ('past_due', 'suspended') and (v_pago or p_evento = 'PAYMENT_DELETED') then
    -- Só PAGAR (ou o Asaas remover a cobrança em atraso) tira do atraso: uma
    -- cobrança nova que ainda não venceu não é pagamento — o atraso que veio
    -- do fim do teste continuaria valendo.
    v_novo := 'active';
  elsif v_tenant.plan_status = 'trial' and v_pago then
    v_novo := 'active';
  end if;

  update public.tenants set
    plan_status = v_novo,
    em_atraso_desde = case when v_novo in ('past_due', 'suspended')
                           then coalesce(least(em_atraso_desde, v_atraso), v_atraso, em_atraso_desde) else null end,
    updated_at = now()
  where id = v_sub.tenant_id;

  update public.tenant_subscriptions set
    proximo_vencimento = (select min(i.vencimento) from public.subscription_invoices i
                           where i.tenant_id = v_sub.tenant_id and not i.removida
                             and i.situacao in ('PENDING', 'OVERDUE')),
    updated_at = now()
  where tenant_id = v_sub.tenant_id;

  return jsonb_build_object('tenant_id', v_sub.tenant_id, 'antes', v_tenant.plan_status, 'depois', v_novo);
end $$;

-- 5. As regras de tempo (o cron) ---------------------------------------------
-- `p_agora` e `p_tenant` para o teste escolher a data sem mexer nas redes reais.
create or replace function public.assinaturas_aplicar_regras(p_agora timestamptz default now(), p_tenant uuid default null)
returns table (tenant_id uuid, de text, para text)
language plpgsql security definer set search_path = public
as $$
declare v_carencia int;
begin
  select dias_de_carencia into v_carencia from public.platform_settings where id = 1;

  -- 1. Teste vencido sem pagamento: entra em atraso, contado do fim do teste.
  return query
  with u as (
    update public.tenants t set
      plan_status = 'past_due',
      em_atraso_desde = (t.trial_ends_at at time zone 'America/Sao_Paulo')::date,
      updated_at = now()
    where t.plan_status = 'trial' and t.trial_ends_at is not null and t.trial_ends_at < p_agora
      and (p_tenant is null or t.id = p_tenant)
      and not exists (select 1 from public.subscription_invoices i
                       where i.tenant_id = t.id and not i.removida
                         and i.situacao in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'))
    returning t.id
  ) select u.id, 'trial'::text, 'past_due'::text from u;

  -- 2. Em atraso além da carência: suspende. A condição no `where` é a
  --    reivindicação — duas passagens não suspendem duas vezes.
  return query
  with u as (
    update public.tenants t set plan_status = 'suspended', updated_at = now()
    where t.plan_status = 'past_due' and t.em_atraso_desde is not null
      and t.em_atraso_desde + coalesce(v_carencia, 7) < (p_agora at time zone 'America/Sao_Paulo')::date
      and (p_tenant is null or t.id = p_tenant)
    returning t.id
  ) select u.id, 'past_due'::text, 'suspended'::text from u;
end $$;

-- 6. Os números do negócio (o painel do /sistema) ----------------------------
-- As redes de teste ([e2e]) ficam fora; o teste pede SÓ elas.
create or replace function public.plataforma_indicadores(p_somente_teste boolean default false)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with redes as (
    select t.* from public.tenants t
     where (t.name like '[e2e]%') = p_somente_teste
  ), mes as (
    select date_trunc('month', now() at time zone 'America/Sao_Paulo') as ini
  )
  select jsonb_build_object(
    'total',      (select count(*) from redes),
    'em_teste',   (select count(*) from redes where is_active and plan_status = 'trial'),
    'ativas',     (select count(*) from redes where is_active and plan_status = 'active'),
    'em_atraso',  (select count(*) from redes where is_active and plan_status = 'past_due'),
    'suspensas',  (select count(*) from redes where is_active and plan_status = 'suspended'),
    'canceladas', (select count(*) from redes where plan_status = 'canceled'),
    'desligadas', (select count(*) from redes where not is_active),
    'mrr_centavos', (select coalesce(sum(s.valor_centavos), 0) from public.tenant_subscriptions s
                       join redes r on r.id = s.tenant_id
                      where r.is_active and r.plan_status in ('active', 'past_due') and s.cobranca <> 'cancelada'),
    'recebido_mes_centavos', (select coalesce(sum(i.valor_centavos), 0) from public.subscription_invoices i
                                join redes r on r.id = i.tenant_id
                               where not i.removida and i.situacao in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
                                 and (i.pago_em at time zone 'America/Sao_Paulo') >= (select ini from mes)),
    'novas_mes',  (select count(*) from redes where (created_at at time zone 'America/Sao_Paulo') >= (select ini from mes)),
    'canceladas_mes', (select count(*) from public.tenant_subscriptions s join redes r on r.id = s.tenant_id
                        where s.cancelada_em is not null
                          and (s.cancelada_em at time zone 'America/Sao_Paulo') >= (select ini from mes)),
    'teste_vencendo_7d', (select count(*) from redes where is_active and plan_status = 'trial'
                            and trial_ends_at between now() and now() + interval '7 days')
  )
$$;

revoke execute on function public.assinatura_aplicar_cobranca(jsonb, text) from public, anon, authenticated;
revoke execute on function public.assinaturas_aplicar_regras(timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.plataforma_indicadores(boolean) from public, anon, authenticated;
grant execute on function public.assinatura_aplicar_cobranca(jsonb, text) to service_role;
grant execute on function public.assinaturas_aplicar_regras(timestamptz, uuid) to service_role;
grant execute on function public.plataforma_indicadores(boolean) to service_role;

notify pgrst, 'reload schema';
