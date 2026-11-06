-- D16 da 8ª simulação (2026-11-06): "Todos os clientes retornaram 🎉" com 30
-- clientes que nunca tiveram uma visita no sistema. O quadro conta quem
-- SUMIU (sem visita desde p_desde, cadastrada antes dele), e a base importada
-- no dia fica fora — o vazio não distinguia "ninguém sumiu" de "ninguém tem
-- visita registrada ainda". As duas contas ganham, além do total e da lista:
--   com_visita          — as clientes do recorte com alguma visita concluída;
--   recentes_sem_visita — as cadastradas desde p_desde sem nenhuma visita
--                         concluída (fora do quadro, por serem novas).
-- O total e a lista não mudam. Partindo dos corpos ATUAIS da produção.

create or replace function public.metrics_clientes_para_reativar(p_tenant uuid, p_branch_id uuid, p_tag text, p_desde timestamp with time zone, p_limite integer default 3, p_professional_id uuid default null::uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with do_recorte as (
    select c.id, c.name, c.phone, c.created_at
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active and c.tags @> array[p_tag]
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            where a.client_id = c.id and a.branch_id = p_branch_id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  da_unidade as (
    select r.id, r.name, r.phone from do_recorte r where r.created_at < p_desde
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
  ),
  visitas as (
    select r.id, r.created_at,
      exists (select 1 from public.appointments a where a.client_id = r.id and a.status = 'COMPLETED') as veio
    from do_recorte r
  )
  select jsonb_build_object(
    'total', (select count(*) from inativos),
    'com_visita', (select count(*) from visitas v where v.veio),
    'recentes_sem_visita', (select count(*) from visitas v where not v.veio and v.created_at >= p_desde),
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
    select c.id, c.name, c.phone, c.branch_id, c.created_at
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            join unidades u on u.id = a.branch_id
            where a.client_id = c.id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  da_rede as (
    select r.id, r.name, r.phone, r.branch_id from do_recorte r where r.created_at < p_desde
  ),
  inativos as (
    select d.*
    from da_rede d
    where not exists (
      select 1 from public.appointments a
      join unidades u on u.id = a.branch_id
      where a.client_id = d.id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.aconteceu_em >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone, ult.aconteceu_em as ultima_visita,
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
      exists (select 1 from public.appointments a join unidades u on u.id = a.branch_id
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

notify pgrst, 'reload schema';
