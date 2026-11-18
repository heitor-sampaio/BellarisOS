-- O que é COMPRA para o CRM (varredura de conformidade de 18/11, CRM-02 e o
-- conflito C-1). Duas regras que o banco não cumpria:
--
-- 1) O pacote trazido de fora (`client_packages.de_fora`, F35) NÃO é venda
--    (vendas-financeiro.md, "Trazer pacote de fora": "Não é venda"). Mas o
--    `pacote_trazer` grava `purchased_at = now()`, e o fato
--    `lead.cliente_comprou` e o sinal "Comprou" do card contavam o pacote de
--    fora como compra — a migração da base marcava "Comprou" em todo card.
--
-- 2) O plano é venda no RECEBIMENTO, não no aceite. O Heitor, 18/11 (DEVLOG,
--    "O plano como venda"): "Obviamente que no recebimento. Uma coisa só foi
--    vendida se foi paga." O fato e o sinal nasciam do `aceito_em` — o aceite
--    é a cliente dizer sim, sem dinheiro nenhum (`plano_aceitar`). Agora: o
--    PRIMEIRO lançamento de receita PAGO do plano (`treatment_plan_id`), que
--    não seja estorno nem estornado; a data é a do pagamento.
--
-- Não depende do código novo: os nomes e o formato das funções ficam.

-- 1) O pacote de fora não dispara o fato.
create or replace function private.lead_cliente_comprou_pacote()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  -- O pacote trazido de fora não é venda (vendas-financeiro.md, F35).
  if new.purchased_at is null or new.cancelado_em is not null or new.de_fora then return new; end if;
  if tg_op = 'UPDATE' and old.purchased_at is not null then return new; end if;
  perform private.lead_cliente_comprou(
    new.client_id, new.branch_id, new.purchased_at,
    'Pacote ' || coalesce((select sp.name from public.service_packages sp where sp.id = new.package_id), ''),
    'pacote:' || new.id);
  return new;
end;
$function$;

-- 2) O plano: sai o gatilho do aceite, entra o do primeiro recebimento.
drop trigger if exists trg_lead_cliente_comprou_plano on public.treatment_plans;
drop function if exists private.lead_cliente_comprou_plano();

-- O lançamento que vale como "o plano foi pago": receita paga, do plano, que
-- não é o estorno nem o estornado, com algum valor (o dinheiro ou os pontos).
create or replace function private.plano_pagamento_que_vale(f public.financial_transactions)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select f.treatment_plan_id is not null
     and f.type::text = 'INCOME'
     and coalesce(f.is_paid, false)
     and f.category is distinct from 'Estorno'
     and coalesce(f.notes, '') <> 'Estornada'
     and coalesce(f.amount, 0) + coalesce(f.loyalty_discount, 0) > 0
$function$;

revoke execute on function private.plano_pagamento_que_vale(public.financial_transactions) from public, anon, authenticated;

create or replace function private.lead_cliente_comprou_plano_pago()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_plano public.treatment_plans%rowtype;
begin
  if not private.plano_pagamento_que_vale(new) then return new; end if;
  if tg_op = 'UPDATE' and private.plano_pagamento_que_vale(old) then return new; end if;
  -- Só o PRIMEIRO recebimento: a venda é uma, no dia em que o dinheiro entrou.
  if exists (
    select 1 from public.financial_transactions f
     where f.treatment_plan_id = new.treatment_plan_id
       and f.id <> new.id
       and private.plano_pagamento_que_vale(f)
  ) then return new; end if;

  select * into v_plano from public.treatment_plans tp where tp.id = new.treatment_plan_id;
  if not found or v_plano.client_id is null or v_plano.status = 'CANCELLED' then return new; end if;

  perform private.lead_cliente_comprou(
    v_plano.client_id, v_plano.branch_id, coalesce(new.paid_at, new.created_at, now()),
    case when nullif(trim(v_plano.name), '') is null then 'Plano de tratamento'
         when v_plano.name ilike 'plano%' then trim(v_plano.name) else 'Plano ' || trim(v_plano.name) end,
    'plano:' || v_plano.id);
  return new;
end;
$function$;

revoke execute on function private.lead_cliente_comprou_plano_pago() from public, anon, authenticated;

drop trigger if exists trg_lead_cliente_comprou_plano_pago on public.financial_transactions;
create trigger trg_lead_cliente_comprou_plano_pago
  after insert or update of is_paid on public.financial_transactions
  for each row execute function private.lead_cliente_comprou_plano_pago();

-- 3) O sinal "Comprou" do card: sem o pacote de fora, e o plano pelo primeiro
-- recebimento (a mesma régua do fato). O valor continua o vendido.
create or replace function public.crm_sinais_do_quadro(p_tenant uuid, p_clientes uuid[])
returns table(client_id uuid, proximo_agendamento timestamptz, compra_em timestamptz, compra text, compra_valor numeric)
language sql
stable security definer
set search_path to ''
as $function$
  with c as (
    select x.id from public.clients x where x.tenant_id = p_tenant and x.id = any (p_clientes)
  ), ag as (
    select distinct on (a.client_id) a.client_id, a.scheduled_at
      from public.appointments a
      join c on c.id = a.client_id
     where a.status::text in ('SCHEDULED', 'CONFIRMED', 'ARRIVED')
       and a.scheduled_at >= now()
     order by a.client_id, a.scheduled_at
  ), pago as (
    select f.treatment_plan_id, min(coalesce(f.paid_at, f.created_at)) as em
      from public.financial_transactions f
      join public.treatment_plans tp on tp.id = f.treatment_plan_id
      join c on c.id = tp.client_id
     where private.plano_pagamento_que_vale(f)
     group by f.treatment_plan_id
  ), compras as (
    select cp.client_id, cp.purchased_at as em, 'Pacote ' || coalesce(sp.name, '') as o_que,
           greatest(coalesce(cp.price, 0) - coalesce(cp.valor_cancelado, 0), 0) as valor
      from public.client_packages cp
      join c on c.id = cp.client_id
      left join public.service_packages sp on sp.id = cp.package_id
     where cp.cancelado_em is null and cp.purchased_at is not null and not cp.de_fora
    union all
    select ps.client_id, ps.sold_at, coalesce(pr.name, 'Procedimento') || ' (pré-pago)',
           coalesce(ps.price, 0)
      from public.procedure_sales ps
      join c on c.id = ps.client_id
      left join public.procedures pr on pr.id = ps.procedure_id
     where ps.tenant_id = p_tenant and ps.sold_at is not null
    union all
    select tp.client_id, pago.em,
           case when nullif(trim(tp.name), '') is null then 'Plano de tratamento'
                when tp.name ilike 'plano%' then trim(tp.name) else 'Plano ' || trim(tp.name) end,
           greatest(coalesce((select sum(sp2.price)
                                from public.treatment_plan_sessions s
                                join public.treatment_plan_session_procedures sp2 on sp2.session_id = s.id
                               where s.plan_id = tp.id), 0) - coalesce(tp.valor_cancelado, 0), 0)
      from public.treatment_plans tp
      join c on c.id = tp.client_id
      join pago on pago.treatment_plan_id = tp.id
     where tp.status <> 'CANCELLED'
  ), ultima as (
    select distinct on (k.client_id) k.client_id, k.em, k.o_que, k.valor from compras k order by k.client_id, k.em desc
  )
  select c.id, ag.scheduled_at, ultima.em, ultima.o_que, ultima.valor
    from c
    left join ag on ag.client_id = c.id
    left join ultima on ultima.client_id = c.id
   where ag.scheduled_at is not null or ultima.em is not null;
$function$;

revoke execute on function public.crm_sinais_do_quadro(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.crm_sinais_do_quadro(uuid, uuid[]) to service_role;

-- A versão sem o valor (nenhum chamador no app desde 18/11; fica com a mesma régua).
create or replace function public.crm_sinais_dos_clientes(p_tenant uuid, p_clientes uuid[])
 returns table(client_id uuid, proximo_agendamento timestamptz, compra_em timestamptz, compra text)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with c as (
    select x.id from public.clients x where x.tenant_id = p_tenant and x.id = any (p_clientes)
  ), ag as (
    select distinct on (a.client_id) a.client_id, a.scheduled_at
      from public.appointments a
      join c on c.id = a.client_id
     where a.status::text in ('SCHEDULED', 'CONFIRMED', 'ARRIVED')
       and a.scheduled_at >= now()
     order by a.client_id, a.scheduled_at
  ), pago as (
    select f.treatment_plan_id, min(coalesce(f.paid_at, f.created_at)) as em
      from public.financial_transactions f
      join public.treatment_plans tp on tp.id = f.treatment_plan_id
      join c on c.id = tp.client_id
     where private.plano_pagamento_que_vale(f)
     group by f.treatment_plan_id
  ), compras as (
    select cp.client_id, cp.purchased_at as em, 'Pacote ' || coalesce(sp.name, '') as o_que
      from public.client_packages cp
      join c on c.id = cp.client_id
      left join public.service_packages sp on sp.id = cp.package_id
     where cp.cancelado_em is null and cp.purchased_at is not null and not cp.de_fora
    union all
    select ps.client_id, ps.sold_at, coalesce(pr.name, 'Procedimento') || ' (pré-pago)'
      from public.procedure_sales ps
      join c on c.id = ps.client_id
      left join public.procedures pr on pr.id = ps.procedure_id
     where ps.tenant_id = p_tenant and ps.sold_at is not null
    union all
    select tp.client_id, pago.em,
           case when nullif(trim(tp.name), '') is null then 'Plano de tratamento'
                when tp.name ilike 'plano%' then trim(tp.name) else 'Plano ' || trim(tp.name) end
      from public.treatment_plans tp
      join c on c.id = tp.client_id
      join pago on pago.treatment_plan_id = tp.id
     where tp.status <> 'CANCELLED'
  ), ultima as (
    select distinct on (k.client_id) k.client_id, k.em, k.o_que from compras k order by k.client_id, k.em desc
  )
  select c.id, ag.scheduled_at, ultima.em, ultima.o_que
    from c
    left join ag on ag.client_id = c.id
    left join ultima on ultima.client_id = c.id
   where ag.scheduled_at is not null or ultima.em is not null;
$function$;

revoke execute on function public.crm_sinais_dos_clientes(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.crm_sinais_dos_clientes(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
