-- Bloco Tags do plano de adaptação (T1; a revisão do Heitor de 2026-11-13 —
-- CLAUDE.md §1, "Tags", e a H16 em docs/regras/crm-inbox.md): "O sistema não
-- coloca tag nenhuma automaticamente em ninguém por nenhum motivo", e "não
-- existem tags de unidade". A cliente é da REDE.
--
-- 1. Sai o gatilho que punha "Unidade: X" na ficha a cada agendamento
--    (migration 20260721140001). DESTRUTIVO: drop do gatilho e da função.
-- 2. O vocabulário registra também a "Unidade: …" (ela é uma tag como as
--    outras: a rede renomeia, arquiva ou tira se quiser).
-- 3. Toda conta que lia a tag como "a unidade da cliente" passa a ler o FATO:
--    a cliente atendida (agendamento não cancelado) numa unidade do recorte.
--    O recorte que é a clínica inteira (nulo, ou todas as unidades ativas —
--    recorte_e_a_clinica) conta todas, como antes.
--    - metrics_core / metrics_new_clients_series / metrics_by_branch: as novas
--      clientes da unidade são as novas (coalesce(cliente_desde, created_at)
--      no período) atendidas nela; quem foi atendida em duas conta em cada
--      uma, e uma vez no total — a frase que o ranking já diz.
--    - metrics_clientes_para_reativar: a lista da unidade é de quem foi
--      atendida nela (sai o p_tag; DESTRUTIVO: drop da assinatura antiga).
--    - clientes_do_publico: sai o filtro de unidade (MK2: "as tags e o filtro
--      de tag já cobrem o caso"); o branch_ids que chegar é ignorado.
--    - copilot_clientes_da_tag: sai o p_tag_unidade (DESTRUTIVO: drop da
--      assinatura antiga).
--    - tags_das_unidades: sem leitor, sai (DESTRUTIVO).
-- Os corpos partem dos da produção em 2026-11-14 (pg_get_functiondef).
-- Sem backfill: as "Unidade: …" gravadas ficam como tags comuns (o banco é
-- zerado antes do lançamento).

-- 1. O gatilho
drop trigger if exists trg_appointment_unit_tag on public.appointments;
drop function if exists public.on_appointment_add_unit_tag();

-- 2. O vocabulário
create or replace function private.registrar_tags(p_tenant uuid, p_lista text[])
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.tags (tenant_id, nome)
  select distinct on (lower(btrim(x))) p_tenant, btrim(x)
  from unnest(coalesce(p_lista, '{}')) as x
  where length(btrim(x)) between 1 and 60
  on conflict (tenant_id, lower(nome)) do nothing
$function$;

-- 3a. O núcleo dos indicadores
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
            where a.id = t.appointment_id and a.professional_id = p_professional_id)
          or exists (select 1 from public.product_sales ps
                      where ps.id = t.product_sale_id and ps.sold_by = p_professional_id)
          or exists (select 1 from public.client_packages cpv
                      where cpv.id = t.client_package_id and cpv.sold_by = p_professional_id)
          or exists (select 1 from public.procedure_sales psv
                      where psv.id = t.procedure_sale_id and psv.sold_by = p_professional_id))
  ),
  despesas as (
    select m.amount
    from public.metrics_movimentos_pagos(p_tenant, p_branch_ids, p_from, p_to) m
    where m.type = 'EXPENSE'
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.id = m.appointment_id and a.professional_id = p_professional_id)
          or exists (select 1 from public.product_sales ps
                      where ps.id = m.product_sale_id and ps.sold_by = p_professional_id)
          or exists (select 1 from public.client_packages cpv
                      where cpv.id = m.client_package_id and cpv.sold_by = p_professional_id)
          or exists (select 1 from public.procedure_sales psv
                      where psv.id = m.procedure_sale_id and psv.sold_by = p_professional_id))
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
  ),
  clinica as (select public.recorte_e_a_clinica(p_tenant, p_branch_ids) as toda)
  select
    coalesce((select sum(r.amount) from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) r), 0),
    coalesce((select sum(t.amount) from tx t
               where t.type = 'INCOME' and not t.is_paid
                 and t.data_de_referencia between p_from and p_to), 0),
    coalesce((select sum(d.amount) from despesas d), 0),
    coalesce((select sum(a.price) from appt a where a.status = 'COMPLETED'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED'),
    (select count(*) from appt),
    (select count(*) from appt a where a.status = 'CANCELLED'),
    (select count(*) from appt a where a.status = 'NO_SHOW'),
    coalesce((select sum(a.duration_min) from appt a
               where a.status not in ('CANCELLED', 'NO_SHOW')), 0),
    -- F35: a cliente importada com "cliente desde" de antes não é nova.
    -- T1 (Bloco Tags): a da unidade é a atendida nela (agendamento não
    -- cancelado); a clínica inteira, todas.
    (select count(*) from public.clients c, clinica k
       where c.tenant_id = p_tenant
         and c.is_active
         and coalesce(c.cliente_desde::timestamp at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)), c.created_at) between p_from and p_to
         and (k.toda or exists (
               select 1 from public.appointments a
               join scope s on s.id = a.branch_id
               where a.client_id = c.id and a.status <> 'CANCELLED'))
         and (p_professional_id is null or exists (
               select 1 from public.appointments a
               join scope s on s.id = a.branch_id
               where a.client_id = c.id and a.professional_id = p_professional_id
                 and a.status <> 'CANCELLED'))),
    coalesce((select sum(c.amount) from comm c where c.status = 'OPEN'), 0),
    coalesce((select sum(c.amount) from comm c where c.status = 'PAID'), 0),
    (select count(*) from appt a where a.status = 'COMPLETED' and coalesce(a.price, 0) > 0);
$function$;

-- 3a. A série das novas clientes
create or replace function public.metrics_new_clients_series(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null::uuid)
 returns table(bucket timestamp with time zone, count bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with desde as (
    select c.id, coalesce(c.cliente_desde::timestamp at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)), c.created_at) as em
    from public.clients c
    where c.tenant_id = p_tenant
      and c.is_active
      -- T1 (Bloco Tags): a da unidade é a atendida nela; a clínica, todas.
      and (public.recorte_e_a_clinica(p_tenant, p_branch_ids) or exists (
            select 1 from public.appointments a
            join public.branches b on b.id = a.branch_id
            where a.client_id = c.id and a.status <> 'CANCELLED'
              and b.tenant_id = p_tenant and b.id = any (p_branch_ids)))
  )
  select
    date_trunc(
      case when p_granularity in ('hour', 'day', 'month') then p_granularity else 'day' end,
      d.em at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids))
    ) at time zone (select public.fuso_do_recorte(p_tenant, p_branch_ids)) as bucket,
    count(*)
  from desde d
  where d.em between p_from and p_to
    and (p_professional_id is null or exists (
          select 1 from public.appointments a
          join public.branches b on b.id = a.branch_id
          where a.client_id = d.id and a.professional_id = p_professional_id
            and a.status <> 'CANCELLED'
            and b.tenant_id = p_tenant
            and (p_branch_ids is null or b.id = any (p_branch_ids))))
  group by 1
  order by 1;
$function$;

-- 3a. Por unidade ("Por filial", o ranking)
create or replace function public.metrics_by_branch(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(branch_id uuid, branch_name text, branch_slug text, is_active boolean, revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric, transactions_count bigint, appointments_charged bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with mov as (
    select m.branch_id, m.type, m.payment_method, m.amount
      from public.metrics_movimentos_pagos(p_tenant, null, p_from, p_to) m
  )
  select
    b.id, b.name, b.slug, b.is_active,
    coalesce((select sum(m.amount) from mov m
               where m.branch_id = b.id and m.type = 'INCOME'
                 and m.payment_method is distinct from 'INTERNAL_CREDIT'), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and not t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and t.data_de_referencia between p_from and p_to), 0),
    coalesce((select sum(m.amount) from mov m
               where m.branch_id = b.id and m.type = 'EXPENSE'), 0),
    coalesce((select sum(a.price) from public.appointments a
               where a.branch_id = b.id and a.status = 'COMPLETED'
                 and a.aconteceu_em between p_from and p_to), 0),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'COMPLETED'
         and a.aconteceu_em between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.aconteceu_em between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'CANCELLED'
         and a.aconteceu_em between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'NO_SHOW'
         and a.aconteceu_em between p_from and p_to),
    coalesce((select sum(a.duration_min) from public.appointments a
               where a.branch_id = b.id and a.status not in ('CANCELLED', 'NO_SHOW')
                 and a.aconteceu_em between p_from and p_to), 0),
    -- T1 (Bloco Tags): as novas da unidade são as atendidas nela; a unidade
    -- que é a clínica inteira (a rede de uma unidade só) conta todas.
    (select count(*) from public.clients c
       where c.tenant_id = p_tenant and c.is_active
         and (public.recorte_e_a_clinica(p_tenant, array[b.id]) or exists (
               select 1 from public.appointments a
               where a.client_id = c.id and a.branch_id = b.id and a.status <> 'CANCELLED'))
         and coalesce(c.cliente_desde::timestamp at time zone b.fuso, c.created_at) between p_from and p_to),
    coalesce((select sum(c.amount) from public.commissions c
               where c.branch_id = b.id and c.status = 'OPEN'
                 and c.released_at between p_from and p_to), 0),
    coalesce((select sum(c.amount) from public.commissions c
               where c.branch_id = b.id and c.status = 'PAID'
                 and c.released_at between p_from and p_to), 0),
    (select count(*) from public.financial_transactions t
       where t.branch_id = b.id
         and coalesce(t.paid_at, t.created_at) between p_from and p_to),
    (select count(*) from public.appointments a
       where a.branch_id = b.id and a.status = 'COMPLETED' and coalesce(a.price, 0) > 0
         and a.aconteceu_em between p_from and p_to)
  from public.branches b
  where b.tenant_id = p_tenant
  order by b.name;
$function$;

-- 3b. O "Reativar" da unidade
drop function if exists public.metrics_clientes_para_reativar(uuid, uuid, text, timestamp with time zone, integer, uuid);
create function public.metrics_clientes_para_reativar(p_tenant uuid, p_branch_id uuid, p_desde timestamp with time zone, p_limite integer default 3, p_professional_id uuid default null::uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with do_recorte as (
    select c.id, c.name, c.phone,
           coalesce(c.cliente_desde::timestamp at time zone (select public.fuso_da_unidade(p_branch_id)), c.created_at) as created_at,
           c.ultima_visita_antes::timestamp at time zone (select public.fuso_da_unidade(p_branch_id)) as visita_antes
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
      -- T1 (Bloco Tags): a cliente da unidade é a atendida nela (agendamento
      -- não cancelado); a unidade que é a clínica inteira, todas.
      and (public.recorte_e_a_clinica(p_tenant, array[p_branch_id]) or exists (
            select 1 from public.appointments a
            where a.client_id = c.id and a.branch_id = p_branch_id and a.status <> 'CANCELLED'))
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.client_id = c.id and a.branch_id = p_branch_id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  da_unidade as (
    select r.id, r.name, r.phone, r.visita_antes from do_recorte r where r.created_at < p_desde
  ),
  inativos as (
    select d.*
    from da_unidade d
    where (d.visita_antes is null or d.visita_antes < p_desde)
      and not exists (
      select 1 from public.appointments a
      where a.client_id = d.id
        and a.branch_id = p_branch_id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.aconteceu_em >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone, v.ultima as ultima_visita,
           (i.visita_antes is not null and (v.no_sistema is null or i.visita_antes > v.no_sistema)) as antes_do_sistema
    from inativos i
    cross join lateral (
      select m.no_sistema, greatest(m.no_sistema, i.visita_antes) as ultima
        from (select max(a.aconteceu_em) as no_sistema from public.appointments a
               where a.client_id = i.id and a.branch_id = p_branch_id and a.status = 'COMPLETED') m
    ) v
  ),
  visitas as (
    select r.id, r.created_at,
      r.visita_antes is not null
        or exists (select 1 from public.appointments a where a.client_id = r.id and a.status = 'COMPLETED') as veio
    from do_recorte r
  )
  select jsonb_build_object(
    'total', (select count(*) from inativos),
    'com_visita', (select count(*) from visitas v where v.veio),
    'recentes_sem_visita', (select count(*) from visitas v where not v.veio and v.created_at >= p_desde),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'phone', x.phone, 'ultima_visita', x.ultima_visita,
               'antes_do_sistema', x.antes_do_sistema)
             order by x.ultima_visita asc nulls last, x.name)
      from (
        select * from com_ultima
        order by ultima_visita asc nulls last, name
        limit p_limite
      ) x
    ), '[]'::jsonb)
  );
$function$;
revoke execute on function public.metrics_clientes_para_reativar(uuid, uuid, timestamp with time zone, integer, uuid) from public, anon, authenticated;
grant execute on function public.metrics_clientes_para_reativar(uuid, uuid, timestamp with time zone, integer, uuid) to service_role;

-- 3c. O público das campanhas e do "Buscar clientes" das automações (MK2)
create or replace function public.clientes_do_publico(p_tenant uuid, p_filtros jsonb)
 returns table(id uuid, name text, phone text, auth_id text)
 language sql
 stable
 set search_path to ''
as $function$
  with f as (
    select (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'genders') = 'array' then p_filtros->'genders' end) x)          as generos,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'tags') = 'array' then p_filtros->'tags' end) x)                as tags,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'procedure_ids') = 'array' then p_filtros->'procedure_ids' end) x) as procedimentos,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'client_ids') = 'array' then p_filtros->'client_ids' end) x)    as so_estas,
           coalesce((p_filtros->>'has_app_account')::boolean, false) as so_com_app,
           (p_filtros->'aniversario'->>'mes')::int as mes,
           (p_filtros->'aniversario'->>'dia')::int as dia,
           (p_filtros->>'sem_retorno_desde')::timestamptz as sem_retorno_desde,
           (p_filtros->>'cliente_desde_antes')::timestamptz as cliente_desde_antes,
           (p_filtros->>'min_visitas')::int as min_visitas
  )
  select c.id, c.name::text, c.phone::text, c.auth_id::text
    from public.clients c, f
   where c.tenant_id = p_tenant
     and c.is_active
     and (f.so_estas is null or c.id::text = any (f.so_estas))
     and (f.generos is null or c.gender = any (f.generos))
     and (f.tags is null or c.tags && f.tags)
     and (not f.so_com_app or c.auth_id is not null)
     and (f.procedimentos is null or exists (
           select 1 from public.appointments a
            where a.client_id = c.id and a.status = 'COMPLETED'
              and a.procedure_id::text = any (f.procedimentos)))
     and (f.mes is null or (
           c.birth_date is not null
           and extract(month from c.birth_date at time zone 'UTC') = f.mes
           and extract(day   from c.birth_date at time zone 'UTC') = f.dia))
     and (f.sem_retorno_desde is null or (
           not exists (
             select 1 from public.appointments a
              where a.client_id = c.id and a.status = 'COMPLETED'
                and a.scheduled_at >= f.sem_retorno_desde)
           and (c.ultima_visita_antes is null
                or c.ultima_visita_antes::timestamp at time zone public.fuso_da_unidade(c.branch_id) < f.sem_retorno_desde)))
     and (f.cliente_desde_antes is null
          or coalesce(c.cliente_desde::timestamp at time zone public.fuso_da_unidade(c.branch_id), c.created_at) < f.cliente_desde_antes)
     and (f.min_visitas is null or (
           select count(*) from public.appointments a
            where a.client_id = c.id and a.status = 'COMPLETED') >= f.min_visitas)
$function$;

-- 3d. O Copilot: as clientes de uma tag, sem a "tag da unidade"
drop function if exists public.copilot_clientes_da_tag(uuid, text, text, integer);
create function public.copilot_clientes_da_tag(p_tenant uuid, p_tag text, p_limite integer default 50)
 returns table(id uuid, name text, phone text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select c.id, c.name, c.phone
  from public.clients c
  where c.tenant_id = p_tenant
    and c.is_active
    and exists (select 1 from unnest(c.tags) t where lower(btrim(t)) = lower(btrim(p_tag)))
  order by c.name
  limit greatest(1, least(coalesce(p_limite, 50), 200));
$function$;
revoke execute on function public.copilot_clientes_da_tag(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.copilot_clientes_da_tag(uuid, text, integer) to service_role;

-- 3e. Sem leitor
drop function if exists public.tags_das_unidades(uuid[]);

notify pgrst, 'reload schema';
