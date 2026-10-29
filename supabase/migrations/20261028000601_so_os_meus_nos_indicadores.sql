-- "Quem tem 'só os meus' vê 'só os meus', em qualquer lugar" (decisão do
-- Heitor, 2026-10-28). Desde o D7 os dois dashboards passavam o profissional
-- ao núcleo (metrics_core) e escondiam o dinheiro da rede — mas os rankings
-- que só contam, a demografia, o total e os novos clientes, o giro, a lista a
-- reativar e o gráfico do faturamento seguiam mostrando a rede (ou a unidade)
-- inteira a quem tem a agenda ou o financeiro em OWN.
--
-- Cada função ganha `p_professional_id uuid default null` (com o nulo, nada
-- muda para quem não é OWN), com os MESMOS predicados de metrics_core:
--   - atendimento dela: appointments.professional_id = ela;
--   - dinheiro dela: a transação ligada a um atendimento dela
--     (t.appointment_id → appointments.professional_id = ela), o predicado
--     de `tx` em metrics_core — o gráfico bate com o cartão;
--   - cliente dela (DECISÃO NOVA, metrics_core dava 0 novos clientes com
--     profissional): quem tem um agendamento NÃO CANCELADO com ela numa
--     unidade do recorte.
--
-- Os corpos são os da produção (pg_get_functiondef em 2026-10-28) com o
-- recorte a mais. Parâmetro novo muda a assinatura: a antiga sai, senão a
-- chamada sem o profissional ficaria ambígua entre as duas.

-- ---------------------------------------------------------------------------
-- metrics_core: os novos clientes DELA (eram 0 com profissional).
-- ---------------------------------------------------------------------------
create or replace function public.metrics_core(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null::uuid)
 returns table(revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric, appointments_charged bigint)
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
    where a.aconteceu_em >= p_from
      and a.aconteceu_em <= p_to
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
                 and t.data_de_referencia between p_from and p_to), 0),
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
    (select count(*) from public.clients c
       where c.tenant_id = p_tenant
         and c.is_active
         and c.created_at between p_from and p_to
         and (p_branch_ids is null or c.branch_id is null or c.branch_id = any (p_branch_ids))
         and (p_professional_id is null or exists (
               select 1 from public.appointments a
               join scope s on s.id = a.branch_id
               where a.client_id = c.id and a.professional_id = p_professional_id
                 and a.status <> 'CANCELLED'))),
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED' and coalesce(a.price, 0) > 0);
$function$;

-- ---------------------------------------------------------------------------
-- metrics_series: a evolução / o faturamento dos 6 meses DELA.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_series(uuid, uuid[], timestamptz, timestamptz, text);

create function public.metrics_series(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null)
 returns table(bucket timestamp with time zone, revenue numeric, expenses numeric)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with scope as (
    select b.id
    from public.branches b
    where b.tenant_id = p_tenant
      and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  tx as (
    select
      date_trunc(
        case when p_granularity in ('hour', 'day', 'week', 'month') then p_granularity else 'day' end,
        coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo'
      ) at time zone 'America/Sao_Paulo' as bucket,
      t.type,
      t.amount
    from public.financial_transactions t
    join scope s on s.id = t.branch_id
    where t.is_paid
      and coalesce(t.notes, '')    <> 'Estornada'
      and coalesce(t.category, '') <> 'Estorno'
      and coalesce(t.paid_at, t.created_at) between p_from and p_to
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.id = t.appointment_id and a.professional_id = p_professional_id))
  )
  select
    tx.bucket,
    coalesce(sum(tx.amount) filter (where tx.type = 'INCOME'), 0),
    coalesce(sum(tx.amount) filter (where tx.type = 'EXPENSE'), 0)
  from tx
  group by tx.bucket
  order by tx.bucket;
$function$;

-- ---------------------------------------------------------------------------
-- metrics_top_procedures: os procedimentos que ELA fez.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_top_procedures(uuid, uuid[], timestamptz, timestamptz, integer);

create function public.metrics_top_procedures(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer default 5, p_professional_id uuid default null)
 returns table(procedure_id uuid, procedure_name text, appointments bigint, revenue numeric, repeat_visits bigint, avg_rating numeric, rating_count bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  appt as (
    select a.procedure_id, a.client_id, a.price, a.procedure_rating
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED'
      and a.aconteceu_em between p_from and p_to
      and a.procedure_id is not null
      and (p_professional_id is null or a.professional_id = p_professional_id)
  ),
  per_client as (
    select ap.procedure_id, ap.client_id, count(*) as visits
    from appt ap where ap.client_id is not null
    group by ap.procedure_id, ap.client_id
  )
  select
    a.procedure_id,
    p.name,
    count(*),
    coalesce(sum(a.price), 0),
    coalesce((select sum(greatest(pc.visits - 1, 0)) from per_client pc
               where pc.procedure_id = a.procedure_id), 0),
    avg(a.procedure_rating) filter (where a.procedure_rating is not null),
    count(*) filter (where a.procedure_rating is not null)
  from appt a
  join public.procedures p on p.id = a.procedure_id
  group by a.procedure_id, p.name
  order by count(*) desc
  limit p_limit;
$function$;

-- ---------------------------------------------------------------------------
-- metrics_top_professionals: só a linha DELA.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_top_professionals(uuid, uuid[], timestamptz, timestamptz, integer);

create function public.metrics_top_professionals(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer default 5, p_professional_id uuid default null)
 returns table(professional_id uuid, professional_name text, appointments bigint, revenue numeric, commission numeric, avg_rating numeric, rating_count bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
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
      and a.aconteceu_em between p_from and p_to
      and a.professional_id is not null
      and (p_professional_id is null or a.professional_id = p_professional_id)
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

-- ---------------------------------------------------------------------------
-- metrics_top_clients: o que as clientes pagaram pelos atendimentos DELA (o
-- predicado do dinheiro de metrics_core) e as visitas com ela.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_top_clients(uuid, uuid[], timestamptz, timestamptz, integer);

create function public.metrics_top_clients(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer default 10, p_professional_id uuid default null)
 returns table(client_id uuid, client_name text, total_spent numeric, appointments bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  spend as (
    select t.client_id, sum(t.amount) as total
    from public.financial_transactions t
    join scope s on s.id = t.branch_id
    where t.type = 'INCOME' and t.is_paid and t.client_id is not null
      and coalesce(t.notes, '')    <> 'Estornada'
      and coalesce(t.category, '') <> 'Estorno'
      and coalesce(t.paid_at, t.created_at) between p_from and p_to
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.id = t.appointment_id and a.professional_id = p_professional_id))
    group by t.client_id
  ),
  visits as (
    select a.client_id, count(*) as n
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED' and a.client_id is not null
      and a.aconteceu_em between p_from and p_to
      and (p_professional_id is null or a.professional_id = p_professional_id)
    group by a.client_id
  )
  select sp.client_id, c.name, sp.total, coalesce(v.n, 0)
  from spend sp
  join public.clients c on c.id = sp.client_id
  left join visits v on v.client_id = sp.client_id
  order by sp.total desc
  limit p_limit;
$function$;

-- ---------------------------------------------------------------------------
-- metrics_demografia: as clientes DELA (e o total, que o dashboard contava
-- à parte sobre a tabela inteira de clientes da rede).
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_demografia(uuid, uuid[], timestamptz);

create function public.metrics_demografia(p_tenant uuid, p_branch_ids uuid[], p_to timestamp with time zone, p_professional_id uuid default null)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with ativos as (
    select c.id, c.city, c.zip_code, c.birth_date
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            join public.branches b on b.id = a.branch_id
            where a.client_id = c.id and a.professional_id = p_professional_id
              and a.status <> 'CANCELLED'
              and b.tenant_id = p_tenant
              and (p_branch_ids is null or b.id = any (p_branch_ids))))
  ),
  idades as (
    select public.metrics_faixa_etaria(a.birth_date) as faixa
    from ativos a where a.birth_date is not null
  ),
  cidades as (
    select city as cidade, count(*) as n
    from ativos where city is not null and city <> ''
    group by city order by n desc, city limit 5
  ),
  ltv as (
    select t.client_id, t.total_spent
    from public.metrics_top_clients(p_tenant, p_branch_ids, '2000-01-01'::timestamptz, p_to, 2147483647, p_professional_id) t
  ),
  ceps as (
    select regexp_replace(a.zip_code, '\D', '', 'g') as cep,
           count(*) as n,
           coalesce(sum(l.total_spent), 0) as ltv
    from ativos a
    left join ltv l on l.client_id = a.id
    where length(regexp_replace(coalesce(a.zip_code, ''), '\D', '', 'g')) = 8
    group by 1
  )
  select jsonb_build_object(
    'total',   (select count(*) from ativos),
    'idades',  coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'n', n))
                         from (select faixa, count(*) as n from idades where faixa is not null group by faixa) x), '[]'::jsonb),
    'cidades', coalesce((select jsonb_agg(jsonb_build_object('cidade', cidade, 'n', n) order by n desc, cidade)
                         from cidades), '[]'::jsonb),
    'ceps',    coalesce((select jsonb_agg(jsonb_build_object('cep', cep, 'n', n, 'ltv', ltv))
                         from ceps), '[]'::jsonb)
  );
$function$;

-- ---------------------------------------------------------------------------
-- metrics_giro_estoque: o insumo gasto nos atendimentos DELA.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_giro_estoque(uuid[], timestamptz, timestamptz);

create function public.metrics_giro_estoque(p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null)
 returns numeric
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(sum(public.custo_do_movimento(m, p)), 0)
  from public.stock_movements m
  left join public.products p on p.id = m.product_id
  where m.branch_id = any (p_branch_ids)
    and m.type = 'PROCEDURE_USAGE'
    and m.created_at between p_from and p_to
    and (p_professional_id is null or exists (
          select 1 from public.appointments a
          where a.id = m.appointment_id and a.professional_id = p_professional_id));
$function$;

-- ---------------------------------------------------------------------------
-- metrics_clientes_para_reativar: as clientes DELA que sumiram da unidade.
-- "Sumiu" continua sendo da UNIDADE (sem visita nela, com qualquer
-- profissional): a cliente que voltou com outra não precisa ser reativada.
-- ---------------------------------------------------------------------------
drop function if exists public.metrics_clientes_para_reativar(uuid, uuid, text, timestamptz, integer);

create function public.metrics_clientes_para_reativar(p_tenant uuid, p_branch_id uuid, p_tag text, p_desde timestamp with time zone, p_limite integer default 3, p_professional_id uuid default null)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with da_unidade as (
    select c.id, c.name, c.phone
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active and c.tags @> array[p_tag]
      and c.created_at < p_desde
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.client_id = c.id and a.branch_id = p_branch_id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  inativos as (
    select d.*
    from da_unidade d
    where not exists (
      select 1 from public.appointments a
      where a.client_id = d.id
        and a.branch_id = p_branch_id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.aconteceu_em >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone,
      (select max(a.aconteceu_em) from public.appointments a
        where a.client_id = i.id and a.status = 'COMPLETED') as ultima_visita
    from inativos i
  )
  select jsonb_build_object(
    'total', (select count(*) from inativos),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'phone', x.phone, 'ultima_visita', x.ultima_visita)
             order by x.ultima_visita asc nulls last, x.name)
      from (
        select * from com_ultima
        order by ultima_visita asc nulls last, name
        limit p_limite
      ) x
    ), '[]'::jsonb)
  );
$function$;

-- ---------------------------------------------------------------------------
-- Recebem a rede por parâmetro: só o servidor (service role) as chama.
-- ---------------------------------------------------------------------------
revoke all on function public.metrics_core(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.metrics_series(uuid, uuid[], timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.metrics_top_procedures(uuid, uuid[], timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.metrics_top_professionals(uuid, uuid[], timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.metrics_top_clients(uuid, uuid[], timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.metrics_demografia(uuid, uuid[], timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.metrics_giro_estoque(uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.metrics_clientes_para_reativar(uuid, uuid, text, timestamptz, integer, uuid) from public, anon, authenticated;

grant execute on function public.metrics_core(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_series(uuid, uuid[], timestamptz, timestamptz, text, uuid) to service_role;
grant execute on function public.metrics_top_procedures(uuid, uuid[], timestamptz, timestamptz, integer, uuid) to service_role;
grant execute on function public.metrics_top_professionals(uuid, uuid[], timestamptz, timestamptz, integer, uuid) to service_role;
grant execute on function public.metrics_top_clients(uuid, uuid[], timestamptz, timestamptz, integer, uuid) to service_role;
grant execute on function public.metrics_demografia(uuid, uuid[], timestamptz, uuid) to service_role;
grant execute on function public.metrics_giro_estoque(uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_clientes_para_reativar(uuid, uuid, text, timestamptz, integer, uuid) to service_role;

notify pgrst, 'reload schema';
