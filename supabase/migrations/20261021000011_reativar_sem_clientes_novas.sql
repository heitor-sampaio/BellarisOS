-- "Reativar clientes" não sugere quem acabou de chegar (2026-10-21; atrito da
-- simulação de um dia de clínica: a lista trazia uma ficha criada no dia).
-- Para reativar é quem está na clínica há mais tempo que a janela (p_desde)
-- e não veio nela: cadastrada depois de p_desde é cliente nova, não sumida.

create or replace function public.metrics_clientes_para_reativar(p_tenant uuid, p_branch_id uuid, p_tag text, p_desde timestamp with time zone, p_limite integer default 3)
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
  ),
  inativos as (
    select d.*
    from da_unidade d
    where not exists (
      select 1 from public.appointments a
      where a.client_id = d.id
        and a.branch_id = p_branch_id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.scheduled_at >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone,
      (select max(a.scheduled_at) from public.appointments a
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

notify pgrst, 'reload schema';
