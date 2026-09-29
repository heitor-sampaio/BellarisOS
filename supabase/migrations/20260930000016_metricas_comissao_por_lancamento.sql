-- Comissões, fase 3: nas métricas, o período de uma comissão passa a ser o do
-- LANÇAMENTO (`commissions.released_at`), não o do atendimento. É o eixo do
-- fechamento: um ajuste ou estorno lançado em outubro de um atendimento de
-- setembro é dinheiro de outubro. E o plano no modo "quando o cliente paga"
-- libera comissão meses depois da sessão.
--
-- E o ranking de comissão ganha função própria: o dashboard ordenava por
-- comissão o top 5 POR ATENDIMENTOS — quem mais ganhou podia nem aparecer.

create or replace function public.metrics_core(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id
    from public.branches b
    where b.tenant_id = p_tenant
      and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  tx as (
    select t.*
    from public.financial_transactions t
    join scope s on s.id = t.branch_id
    where coalesce(t.notes, '')    <> 'Estornada'
      and coalesce(t.category, '') <> 'Estorno'
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.id = t.appointment_id and a.professional_id = p_professional_id))
  ),
  appt as (
    select a.*
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.scheduled_at >= p_from
      and a.scheduled_at <= p_to
      and (p_professional_id is null or a.professional_id = p_professional_id)
  ),
  comm as (
    select c.status, c.amount
    from public.commissions c
    join scope s on s.id = c.branch_id
    where c.released_at >= p_from
      and c.released_at <= p_to
      and (p_professional_id is null or c.professional_id = p_professional_id)
  )
  select
    coalesce((select sum(t.amount) from tx t
               where t.type = 'INCOME' and t.is_paid
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(t.amount) from tx t
               where t.type = 'INCOME' and not t.is_paid
                 and t.created_at between p_from and p_to), 0),
    coalesce((select sum(t.amount) from tx t
               where t.type = 'EXPENSE' and t.is_paid
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(a.price) from appt a where a.status = 'COMPLETED'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED'),
    (select count(*) from appt),
    (select count(*) from appt a where a.status = 'CANCELLED'),
    (select count(*) from appt a where a.status = 'NO_SHOW'),
    coalesce((select sum(a.duration_min) from appt a
               where a.status not in ('CANCELLED', 'NO_SHOW')), 0),
    case when p_professional_id is null
         then (select count(*) from public.clients c
                 where c.tenant_id = p_tenant
                   and c.created_at between p_from and p_to
                   and (p_branch_ids is null or c.branch_id is null or c.branch_id = any (p_branch_ids)))
         else 0 end,
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0);
$function$;

create or replace function public.metrics_by_branch(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(branch_id uuid, branch_name text, branch_slug text, is_active boolean, revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric, transactions_count bigint)
 language sql
 stable
as $function$
  select
    b.id, b.name, b.slug, b.is_active,
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and not t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and t.created_at between p_from and p_to), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'EXPENSE' and t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(a.price) from public.appointments a
               where a.branch_id = b.id and a.status = 'COMPLETED'
                 and a.scheduled_at between p_from and p_to), 0),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'COMPLETED'
         and a.scheduled_at between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.scheduled_at between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'CANCELLED'
         and a.scheduled_at between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'NO_SHOW'
         and a.scheduled_at between p_from and p_to),
    coalesce((select sum(a.duration_min) from public.appointments a
               where a.branch_id = b.id and a.status not in ('CANCELLED', 'NO_SHOW')
                 and a.scheduled_at between p_from and p_to), 0),
    (select count(*) from public.clients c
       where c.branch_id = b.id and c.created_at between p_from and p_to),
    coalesce((select sum(c.amount) from public.commissions c
               where c.branch_id = b.id and c.status = 'OPEN'
                 and c.released_at between p_from and p_to), 0),
    coalesce((select sum(c.amount) from public.commissions c
               where c.branch_id = b.id and c.status = 'PAID'
                 and c.released_at between p_from and p_to), 0),
    (select count(*) from public.financial_transactions t
       where t.branch_id = b.id
         and coalesce(t.paid_at, t.created_at) between p_from and p_to)
  from public.branches b
  where b.tenant_id = p_tenant
  order by b.name;
$function$;

create or replace function public.metrics_commissions_detail(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(id uuid, professional_id uuid, professional_name text, amount numeric, is_paid boolean, reference_at timestamp with time zone)
 language sql
 stable
as $function$
  select c.id, c.professional_id, u.name, c.amount, c.status = 'PAID', c.released_at
  from public.commissions c
  join public.branches b    on b.id = c.branch_id
  left join public.users u  on u.id = c.professional_id
  where b.tenant_id = p_tenant
    and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
    and c.released_at between p_from and p_to
  order by u.name, c.released_at desc;
$function$;

create or replace function public.metrics_top_professionals(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer default 5)
 returns table(professional_id uuid, professional_name text, appointments bigint, revenue numeric, commission numeric, avg_rating numeric, rating_count bigint)
 language sql
 stable
as $function$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  appt as (
    select a.id, a.professional_id, a.price, a.client_rating
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED'
      and a.scheduled_at between p_from and p_to
      and a.professional_id is not null
  )
  select
    a.professional_id,
    u.name,
    count(*),
    coalesce(sum(a.price), 0),
    coalesce((select sum(c.amount) from public.commissions c
               join scope s on s.id = c.branch_id
               where c.professional_id = a.professional_id
                 and c.released_at between p_from and p_to), 0),
    avg(a.client_rating) filter (where a.client_rating is not null),
    count(*) filter (where a.client_rating is not null)
  from appt a
  join public.users u on u.id = a.professional_id
  group by a.professional_id, u.name
  order by count(*) desc
  limit p_limit;
$function$;

-- O ranking de comissão: quem mais tem comissão LANÇADA no período.
create or replace function public.metrics_ranking_comissao(p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz, p_limit int default 5)
 returns table(professional_id uuid, professional_name text, commission numeric)
 language sql
 stable
 set search_path to ''
as $function$
  select c.professional_id, u.name, sum(c.amount)
    from public.commissions c
    join public.branches b on b.id = c.branch_id
    join public.users u on u.id = c.professional_id
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or c.branch_id = any (p_branch_ids))
     and c.released_at between p_from and p_to
   group by c.professional_id, u.name
  having sum(c.amount) <> 0
   order by sum(c.amount) desc, u.name
   limit p_limit;
$function$;

revoke execute on function public.metrics_ranking_comissao(uuid, uuid[], timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.metrics_ranking_comissao(uuid, uuid[], timestamptz, timestamptz, int) to service_role;

-- metrics_relatorio: só o bloco de comissões por profissional muda de eixo.
-- A troca é por texto conferido — se o trecho não estiver lá, a migration
-- FALHA em vez de seguir com a função velha.
do $$
declare
  v_def  text;
  v_novo text;
begin
  v_def := pg_get_functiondef('public.metrics_relatorio(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, text, text)'::regprocedure);
  v_novo := replace(v_def,
    E'              from public.commissions c\n              join public.appointments a on a.id = c.appointment_id\n              join public.users u on u.id = c.professional_id\n              where c.branch_id = any (unidades) and a.scheduled_at between p_from and p_to',
    E'              from public.commissions c\n              join public.users u on u.id = c.professional_id\n              where c.branch_id = any (unidades) and c.released_at between p_from and p_to');
  v_novo := replace(v_novo,
    E'      -- O período da comissão é o do atendimento que a gerou (commissions não\n      -- tem created_at) — o mesmo recorte de metrics_core.',
    E'      -- O período da comissão é o do LANÇAMENTO (released_at) — o mesmo\n      -- recorte de metrics_core e do fechamento.');
  if v_novo = v_def or position('c.released_at between p_from and p_to' in v_novo) = 0 then
    raise exception 'metrics_relatorio: o trecho das comissões não foi encontrado';
  end if;
  execute v_novo;
end $$;

notify pgrst, 'reload schema';
