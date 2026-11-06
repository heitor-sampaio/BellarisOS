-- F35 — a migração pela planilha (decisão 1 (c) do Heitor sobre a 8ª
-- simulação, 2026-11-06: "concordo"), D2, A5, A6, A7 e A9.
--
-- 1. A ficha ganha "cliente desde" e a "última visita" do sistema de antes.
--    A Lúcia importou 33 clientes de 5 anos de clínica: o mês contou 32
--    "Novos clientes", e o "Reativar clientes" dizia que todas tinham voltado.
--    - "Cliente desde" (`clients.cliente_desde`, uma data): a ficha importada
--      com "cliente desde" anterior ao mês NÃO conta como cliente nova dele.
--      Os "novos clientes" contam pela data de quando ela é cliente:
--      coalesce(cliente_desde, created_at) — metrics_core, metrics_by_branch,
--      metrics_new_clients_series e o "cadastrada nos 90 dias" do Reativar.
--    - "Última visita" (`clients.ultima_visita_antes`, uma data): a última
--      visita no sistema de ANTES. Não vira atendimento (nada se inventa:
--      sem agendamento, prontuário, receita nem comissão); entra só onde a
--      tela pergunta "quando ela veio por último" — o "Reativar clientes"
--      (sumida = sem visita, nem a de antes, nos 90 dias; a "última visita"
--      dela é a mais recente das duas), o público "sem retorno" das campanhas
--      e a "Última visita" da lista de Clientes (decidido pelo princípio 3: o
--      número que a tela mostra é o que vale na conta).
-- 2. A importação guarda as linhas que entraram COM AVISO (D2: o campo
--    opcional ilegível não recusa mais a linha) — `importacoes.avisos` e
--    `com_aviso`, ao lado dos `erros` (as recusadas), com o mesmo prazo de
--    7 dias (é dado pessoal).
-- 3. A9: as aniversariantes do mês, pelo banco (a lista de Clientes filtra
--    por elas).

alter table public.clients
  add column if not exists cliente_desde date,
  add column if not exists ultima_visita_antes date;
comment on column public.clients.cliente_desde is
  'F35: desde quando ela é cliente (a migração). Os "novos clientes" contam por coalesce(cliente_desde, created_at).';
comment on column public.clients.ultima_visita_antes is
  'F35: a última visita no sistema de ANTES (a migração). Não é atendimento: entra no "Reativar", no "sem retorno" e na "Última visita" da lista.';

alter table public.importacoes
  add column if not exists avisos jsonb not null default '[]'::jsonb,
  add column if not exists com_aviso integer not null default 0;
comment on column public.importacoes.avisos is
  'F35/D2: as linhas que entraram sem algum campo ilegível ({linha, nome, motivo}). Expira com os erros (7 dias).';

-- ─── Os "novos clientes": pela data de quando ela é cliente ─────────────────
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
                 and t.payment_method is distinct from 'INTERNAL_CREDIT'
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
    -- F35: a cliente importada com "cliente desde" de antes não é nova.
    (select count(*) from public.clients c
       where c.tenant_id = p_tenant
         and c.is_active
         and coalesce(c.cliente_desde::timestamp at time zone 'America/Sao_Paulo', c.created_at) between p_from and p_to
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

create or replace function public.metrics_by_branch(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(branch_id uuid, branch_name text, branch_slug text, is_active boolean, revenue_cash numeric, revenue_pending numeric, expenses_cash numeric, service_revenue numeric, appointments_completed bigint, appointments_total bigint, appointments_cancelled bigint, appointments_no_show bigint, scheduled_minutes bigint, new_clients bigint, commissions_open numeric, commissions_paid numeric, transactions_count bigint, appointments_charged bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  select
    b.id, b.name, b.slug, b.is_active,
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and t.is_paid
                 and t.payment_method is distinct from 'INTERNAL_CREDIT'
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'INCOME' and not t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and t.data_de_referencia between p_from and p_to), 0),
    coalesce((select sum(t.amount) from public.financial_transactions t
               where t.branch_id = b.id and t.type = 'EXPENSE' and t.is_paid
                 and coalesce(t.notes, '')    <> 'Estornada'
                 and coalesce(t.category, '') <> 'Estorno'
                 and coalesce(t.paid_at, t.created_at) between p_from and p_to), 0),
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
    -- F35: a cliente importada com "cliente desde" de antes não é nova.
    (select count(*) from public.clients c
       where c.branch_id = b.id and c.is_active
         and coalesce(c.cliente_desde::timestamp at time zone 'America/Sao_Paulo', c.created_at) between p_from and p_to),
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

create or replace function public.metrics_new_clients_series(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null::uuid)
 returns table(bucket timestamp with time zone, count bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with desde as (
    -- F35: de quando ela é cliente (a importada com "cliente desde" de antes não é nova).
    select c.id, coalesce(c.cliente_desde::timestamp at time zone 'America/Sao_Paulo', c.created_at) as em
    from public.clients c
    where c.tenant_id = p_tenant
      and c.is_active
      and (p_branch_ids is null or c.branch_id is null or c.branch_id = any (p_branch_ids))
  )
  select
    date_trunc(
      case when p_granularity in ('hour', 'day', 'month') then p_granularity else 'day' end,
      d.em at time zone 'America/Sao_Paulo'
    ) at time zone 'America/Sao_Paulo' as bucket,
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

-- ─── O "Reativar clientes": a visita de antes conta como visita ─────────────
create or replace function public.metrics_clientes_para_reativar(p_tenant uuid, p_branch_id uuid, p_tag text, p_desde timestamp with time zone, p_limite integer default 3, p_professional_id uuid default null::uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with do_recorte as (
    select c.id, c.name, c.phone,
           -- F35: de quando ela é cliente, e a última visita no sistema de antes.
           coalesce(c.cliente_desde::timestamp at time zone 'America/Sao_Paulo', c.created_at) as created_at,
           c.ultima_visita_antes::timestamp at time zone 'America/Sao_Paulo' as visita_antes
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active and c.tags @> array[p_tag]
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
               where a.client_id = i.id and a.status = 'COMPLETED') m
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

create or replace function public.metrics_clientes_para_reativar_rede(p_tenant uuid, p_desde timestamp with time zone, p_limite integer default 3, p_professional_id uuid default null::uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with unidades as (
    select b.id, b.name, b.slug from public.branches b where b.tenant_id = p_tenant
  ),
  do_recorte as (
    select c.id, c.name, c.phone, c.branch_id,
           -- F35: de quando ela é cliente, e a última visita no sistema de antes.
           coalesce(c.cliente_desde::timestamp at time zone 'America/Sao_Paulo', c.created_at) as created_at,
           c.ultima_visita_antes::timestamp at time zone 'America/Sao_Paulo' as visita_antes
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            join unidades u on u.id = a.branch_id
            where a.client_id = c.id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  da_rede as (
    select r.id, r.name, r.phone, r.branch_id, r.visita_antes from do_recorte r where r.created_at < p_desde
  ),
  inativos as (
    select d.*
    from da_rede d
    where (d.visita_antes is null or d.visita_antes < p_desde)
      and not exists (
      select 1 from public.appointments a
      join unidades u on u.id = a.branch_id
      where a.client_id = d.id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.aconteceu_em >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone,
           greatest(ult.aconteceu_em, i.visita_antes) as ultima_visita,
           (i.visita_antes is not null and (ult.aconteceu_em is null or i.visita_antes > ult.aconteceu_em)) as antes_do_sistema,
           coalesce(ult.branch_id, i.branch_id) as unidade_id
    from inativos i
    left join lateral (
      select a.aconteceu_em, a.branch_id
      from public.appointments a
      join unidades u on u.id = a.branch_id
      where a.client_id = i.id and a.status = 'COMPLETED'
      order by a.aconteceu_em desc
      limit 1
    ) ult on true
  ),
  visitas as (
    select r.id, r.created_at,
      r.visita_antes is not null
        or exists (select 1 from public.appointments a join unidades u on u.id = a.branch_id
                    where a.client_id = r.id and a.status = 'COMPLETED') as veio
    from do_recorte r
  )
  select jsonb_build_object(
    'total', (select count(*) from inativos),
    'com_visita', (select count(*) from visitas v where v.veio),
    'recentes_sem_visita', (select count(*) from visitas v where not v.veio and v.created_at >= p_desde),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'phone', x.phone, 'ultima_visita', x.ultima_visita,
               'antes_do_sistema', x.antes_do_sistema,
               'unidade', u.name, 'unidade_slug', u.slug)
             order by x.ultima_visita asc nulls last, x.name)
      from (
        select * from com_ultima
        order by ultima_visita asc nulls last, name
        limit p_limite
      ) x
      left join unidades u on u.id = x.unidade_id
    ), '[]'::jsonb)
  );
$function$;

-- ─── A "Última visita" da lista de Clientes ─────────────────────────────────
create or replace function public.ultimas_visitas(p_tenant uuid, p_branch uuid default null::uuid)
 returns table(client_id uuid, ultima timestamp with time zone)
 language sql
 stable
 set search_path to ''
as $function$
  select x.client_id, max(x.ultima)
    from (
      select a.client_id, a.aconteceu_em as ultima
        from public.appointments a
        join public.branches b on b.id = a.branch_id
       where b.tenant_id = p_tenant
         and (p_branch is null or a.branch_id = p_branch)
         and a.status = 'COMPLETED'
         and a.client_id is not null
      union all
      -- F35: a última visita no sistema de antes (a migração).
      select c.id, c.ultima_visita_antes::timestamp at time zone 'America/Sao_Paulo'
        from public.clients c
       where c.tenant_id = p_tenant
         and c.ultima_visita_antes is not null
         and (p_branch is null or c.branch_id = p_branch)
    ) x
   group by x.client_id
$function$;

-- ─── O público "sem retorno" das campanhas ──────────────────────────────────
create or replace function public.clientes_do_publico(p_tenant uuid, p_filtros jsonb)
 returns table(id uuid, name text, phone text, auth_id text)
 language sql
 stable
 set search_path to ''
as $function$
  with f as (
    select (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'branch_ids') = 'array' then p_filtros->'branch_ids' end) x)    as unidades,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'genders') = 'array' then p_filtros->'genders' end) x)          as generos,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'tags') = 'array' then p_filtros->'tags' end) x)                as tags,
           (select array_agg(x) from jsonb_array_elements_text(
              case when jsonb_typeof(p_filtros->'procedure_ids') = 'array' then p_filtros->'procedure_ids' end) x) as procedimentos,
           coalesce((p_filtros->>'has_app_account')::boolean, false) as so_com_app,
           (p_filtros->'aniversario'->>'mes')::int as mes,
           (p_filtros->'aniversario'->>'dia')::int as dia,
           (p_filtros->>'sem_retorno_desde')::timestamptz as sem_retorno_desde
  )
  select c.id, c.name::text, c.phone::text, c.auth_id::text
    from public.clients c, f
   where c.tenant_id = p_tenant
     and c.is_active
     and (f.unidades is null or c.branch_id::text = any (f.unidades))
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
           -- F35: a visita no sistema de antes também é retorno.
           and (c.ultima_visita_antes is null
                or c.ultima_visita_antes::timestamp at time zone 'America/Sao_Paulo' < f.sem_retorno_desde)))
$function$;

-- ─── A9: as aniversariantes do mês ──────────────────────────────────────────
-- O nascimento é guardado à meia-noite UTC (o dia é o do UTC, como em
-- copilot_aniversariantes e no público das campanhas). Só o servidor chama
-- (a lista de Clientes, com a rede da sessão): a rede vem por parâmetro.
create or replace function public.clientes_aniversariantes(p_tenant uuid, p_mes integer)
 returns table(client_id uuid, dia integer)
 language sql
 stable
 set search_path to ''
as $function$
  select c.id, extract(day from c.birth_date at time zone 'UTC')::int
    from public.clients c
   where c.tenant_id = p_tenant
     and c.is_active
     and c.birth_date is not null
     and extract(month from c.birth_date at time zone 'UTC')::int = p_mes
$function$;
revoke execute on function public.clientes_aniversariantes(uuid, integer) from public, anon, authenticated;
grant execute on function public.clientes_aniversariantes(uuid, integer) to service_role;

notify pgrst, 'reload schema';
