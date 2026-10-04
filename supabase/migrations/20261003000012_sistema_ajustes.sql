-- Administração do sistema: o que a verificação achou (2026-10-03).
--
-- 1. Fatura PAGA não volta atrás: um PAYMENT_OVERDUE que chegue (ou seja
--    reprocessado) depois do PAYMENT_RECEIVED rebaixava a fatura a OVERDUE e
--    tirava do "em dia" quem já pagou.
-- 2. A primeira fatura se perdia: o Asaas manda o PAYMENT_CREATED antes de o
--    app gravar o id da assinatura; agora acha pelo CLIENTE também (e guarda o
--    id da assinatura que veio no evento).
-- 3. O dia do pagamento é o de São Paulo (o banco roda em UTC: virava o dia
--    anterior, e o recebido do dia 1º caía no mês anterior).
-- 4. "Marcar em dia" e "Estender teste" PERDOAM as faturas vencidas até o dia
--    (`atraso_perdoado_ate`): sem isso, o próximo evento recalculava o atraso
--    antigo e o cron suspendia na hora seguinte.
-- 5. MRR só com a cobrança ligada (a rede "já cobrando" sem Asaas não é
--    receita recorrente de verdade).
-- 6. Trava de ativação da cobrança (dois cliques não criam duas assinaturas).
-- 7. A rede BLOQUEADA também na RLS: o membro de uma rede desligada, suspensa
--    ou cancelada tinha o JWT e a chave pública na mão, e lia e gravava pelo
--    PostgREST e pelo Realtime. `jwt_claim` devolve nulo — toda política nega.
--    O estado da rede é lido uma vez por transação (GUC `bellaris.rede`).

alter table public.tenants add column if not exists atraso_perdoado_ate date;
alter table public.tenant_subscriptions add column if not exists ativando_em timestamptz;

-- 7. A rede bloqueada na RLS -------------------------------------------------
create or replace function private.rede_estado(p_tenant text)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v_b boolean;
begin
  select not t.is_active or t.plan_status in ('suspended', 'canceled') into v_b
    from public.tenants t where t.id::text = p_tenant;
  perform set_config('bellaris.rede', p_tenant || ':' || case when coalesce(v_b, false) then 'b' else 'l' end, true);
  return case when coalesce(v_b, false) then 'b' else 'l' end;
end $$;

create or replace function public.jwt_claim(claim text)
returns text language plpgsql stable set search_path = ''
as $$
declare
  v_j jsonb := auth.jwt();
  v_sid text := v_j ->> 'session_id';
  v_tid text := v_j -> 'app_metadata' ->> 'tenant_id';
  v_c text;
begin
  if v_sid is not null and v_sid <> '' then
    v_c := current_setting('bellaris.suporte', true);
    if v_c is null or v_c not like v_sid || ':%' then
      perform private.suporte_estado();
      v_c := current_setting('bellaris.suporte', true);
    end if;
    -- Sessão de suporte encerrada ou vencida: nenhum claim, toda política nega.
    if substr(v_c, length(v_sid) + 2, 1) = 'e' then return null; end if;
  end if;
  if v_tid is not null and v_tid <> '' then
    v_c := current_setting('bellaris.rede', true);
    if v_c is null or v_c not like v_tid || ':%' then
      perform private.rede_estado(v_tid);
      v_c := current_setting('bellaris.rede', true);
    end if;
    -- Rede bloqueada (desligada, suspensa, cancelada): idem.
    if substr(v_c, length(v_tid) + 2, 1) = 'b' then return null; end if;
  end if;
  return v_j -> 'app_metadata' ->> claim;
end $$;

-- 1–4. A cobrança --------------------------------------------------------------
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
  v_dia_pago date := coalesce((p_payment ->> 'paymentDate')::date, (p_payment ->> 'clientPaymentDate')::date);
begin
  -- Pela assinatura; senão (o evento chegou antes de o app gravar o id dela),
  -- pelo cliente.
  select * into v_sub from public.tenant_subscriptions s
   where (p_payment ->> 'subscription' is not null and s.asaas_subscription_id = p_payment ->> 'subscription')
      or (s.asaas_customer_id is not null and s.asaas_customer_id = p_payment ->> 'customer')
   order by (s.asaas_subscription_id = p_payment ->> 'subscription') desc nulls last
   limit 1
   for update;
  if not found then return jsonb_build_object('ignorado', 'assinatura desconhecida'); end if;

  if v_sub.asaas_subscription_id is null and p_payment ->> 'subscription' is not null then
    update public.tenant_subscriptions set asaas_subscription_id = p_payment ->> 'subscription'
     where tenant_id = v_sub.tenant_id;
  end if;

  select * into v_tenant from public.tenants where id = v_sub.tenant_id for update;

  insert into public.subscription_invoices
    (tenant_id, asaas_payment_id, asaas_subscription_id, valor_centavos, vencimento, situacao, pago_em, invoice_url, removida, updated_at)
  values (
    v_sub.tenant_id, p_payment ->> 'id', p_payment ->> 'subscription',
    round(coalesce((p_payment ->> 'value')::numeric, 0) * 100)::int,
    (p_payment ->> 'dueDate')::date,
    coalesce(p_payment ->> 'status', 'PENDING'),
    -- Meio-dia em São Paulo: o dia certo em qualquer fuso de leitura.
    case when v_dia_pago is not null then (v_dia_pago + time '12:00') at time zone 'America/Sao_Paulo' end,
    p_payment ->> 'invoiceUrl',
    coalesce((p_payment ->> 'deleted')::boolean, false) or p_evento = 'PAYMENT_DELETED',
    now())
  on conflict (asaas_payment_id) do update set
    valor_centavos = excluded.valor_centavos,
    vencimento     = excluded.vencimento,
    -- PAGA não volta a "em aberto"/"vencida" por um evento atrasado; estorno
    -- e contestação, sim (são mudanças depois do pagamento).
    situacao       = case
                       when public.subscription_invoices.situacao in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
                        and excluded.situacao in ('PENDING', 'OVERDUE')
                       then public.subscription_invoices.situacao
                       else excluded.situacao end,
    pago_em        = coalesce(excluded.pago_em, public.subscription_invoices.pago_em),
    invoice_url    = coalesce(excluded.invoice_url, public.subscription_invoices.invoice_url),
    removida       = excluded.removida,
    updated_at     = now();

  v_pago := p_evento in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')
         or coalesce(p_payment ->> 'status', '') in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH');

  select min(i.vencimento) into v_atraso
    from public.subscription_invoices i
   where i.tenant_id = v_sub.tenant_id and not i.removida
     and i.situacao in ('PENDING', 'OVERDUE') and i.vencimento < (now() at time zone 'America/Sao_Paulo')::date
     and (v_tenant.atraso_perdoado_ate is null or i.vencimento > v_tenant.atraso_perdoado_ate);

  v_novo := v_tenant.plan_status;
  if v_tenant.plan_status = 'canceled' then
    v_novo := 'canceled';
  elsif v_atraso is not null then
    if v_tenant.plan_status in ('trial', 'active') then v_novo := 'past_due'; end if;
  elsif v_tenant.plan_status in ('past_due', 'suspended') and (v_pago or p_evento = 'PAYMENT_DELETED') then
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

-- 5. MRR só com a cobrança ligada -----------------------------------------------
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
                      where r.is_active and r.plan_status in ('active', 'past_due') and s.cobranca = 'ativa'),
    'sem_cobranca', (select count(*) from public.tenant_subscriptions s join redes r on r.id = s.tenant_id
                      where r.is_active and r.plan_status in ('active', 'past_due') and s.cobranca = 'sem_cobranca'
                        and s.valor_centavos > 0),
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

-- O código morto da primeira migration: a regra mora em rede_estado agora.
drop function if exists private.rede_bloqueada(uuid);

revoke execute on function public.assinatura_aplicar_cobranca(jsonb, text) from public, anon, authenticated;
revoke execute on function public.plataforma_indicadores(boolean) from public, anon, authenticated;
grant execute on function public.assinatura_aplicar_cobranca(jsonb, text) to service_role;
grant execute on function public.plataforma_indicadores(boolean) to service_role;

notify pgrst, 'reload schema';
