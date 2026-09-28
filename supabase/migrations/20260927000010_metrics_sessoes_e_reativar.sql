-- Duas contagens que as telas da unidade faziam em JavaScript (CLAUDE.md §13.1).
--
-- 1. Sessões concluídas por procedimento (Procedimentos da unidade): trazia
--    UMA LINHA POR ATENDIMENTO concluído da unidade e contava no JS. Passando
--    de 1000 atendimentos na história da unidade, o PostgREST cortava e cada
--    procedimento mostrava menos sessões do que teve.
--
-- 2. Clientes para reativar (dashboard da unidade): três selects sem limite —
--    os clientes da unidade, as visitas de 90 dias e TODOS os atendimentos dos
--    inativos (com os ids na URL) — e a lista, o total e a ordem montados no JS.

create or replace function public.metrics_sessoes_por_procedimento(
  p_branch_ids uuid[]
)
returns table (procedure_id uuid, sessoes bigint)
language sql
stable
set search_path = ''
as $fn$
  select a.procedure_id, count(*)
  from public.appointments a
  where a.branch_id = any (p_branch_ids)
    and a.status = 'COMPLETED'
    and a.procedure_id is not null
  group by a.procedure_id;
$fn$;

-- Quem "é da unidade" é quem tem a tag dela (o cliente é da REDE; a unidade é
-- tag — §9.2). Inativo = nenhum atendimento nesta unidade, concluído ou por
-- vir, desde `p_desde`. A última visita é a última CONCLUÍDA em qualquer
-- unidade, e quem nunca veio vai para o fim: não é reativação, é primeira
-- visita. Devolve o total e os `p_limite` há mais tempo sem vir.
create or replace function public.metrics_clientes_para_reativar(
  p_tenant    uuid,
  p_branch_id uuid,
  p_tag       text,
  p_desde     timestamptz,
  p_limite    int default 3
)
returns jsonb
language sql
stable
set search_path = ''
as $fn$
  with da_unidade as (
    select c.id, c.name, c.phone
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active and c.tags @> array[p_tag]
  ),
  inativos as (
    select d.*
    from da_unidade d
    where not exists (
      select 1 from public.appointments a
      where a.client_id = d.id
        and a.branch_id = p_branch_id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS')
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
$fn$;

revoke all on function public.metrics_sessoes_por_procedimento(uuid[]) from public, anon, authenticated;
grant execute on function public.metrics_sessoes_por_procedimento(uuid[]) to service_role;
revoke all on function public.metrics_clientes_para_reativar(uuid, uuid, text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.metrics_clientes_para_reativar(uuid, uuid, text, timestamptz, int) to service_role;
