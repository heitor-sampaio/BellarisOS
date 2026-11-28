-- A18 da 43ª simulação (indicadores:CC-06, princípio 3): o "Ver mais 6 (9 no
-- total)" do "Reativar clientes" levava à lista de Clientes inteira, sem o
-- recorte. Decisão do Claude, 28/11: o "Ver mais" abre o resto do MESMO
-- recorte no próprio quadro, em páginas, pela MESMA conta — esta função, que
-- ganha o deslocamento (p_deslocamento, padrão 0: a primeira página é a de
-- sempre).
--
-- O corpo é o VIVO (pg_get_functiondef em 28/11, que já tem a visita de antes
-- da 20261125000001 e a unidade da última visita da 20261123600001), com três
-- trocas:
--   - o parâmetro novo no fim (com padrão: as chamadas de antes valem iguais);
--   - `offset` depois do `limit`;
--   - o desempate por `id` na ordem (duas com o mesmo nome e a mesma última
--     visita mudavam de lugar entre uma página e outra).
-- A assinatura muda, então a função de antes sai (o create or replace criaria
-- uma segunda, ao lado) e a nova fica só com o service_role, como a de antes.

drop function if exists public.metrics_clientes_para_reativar_rede(uuid, timestamp with time zone, integer, uuid);

create function public.metrics_clientes_para_reativar_rede(
  p_tenant uuid, p_desde timestamp with time zone, p_limite integer default 3,
  p_professional_id uuid default null::uuid, p_deslocamento integer default 0)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with unidades as (
    select b.id, b.name, b.slug, b.fuso from public.branches b where b.tenant_id = p_tenant
  ),
  fuso as (select public.fuso_do_recorte(p_tenant, null) as f),
  do_recorte as (
    select c.id, c.name, c.phone,
           -- F35: de quando ela é cliente, e a última visita no sistema de antes.
           -- 24ª: o dia vale da meia-noite da REDE (a cliente é da rede, não da unidade do cadastro).
           least(coalesce(c.cliente_desde::timestamp at time zone (select f from fuso), c.created_at), c.ultima_visita_antes::timestamp at time zone (select f from fuso)) as created_at,
           c.ultima_visita_antes::timestamp at time zone (select f from fuso) as visita_antes
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
      and (p_professional_id is null or exists (
            select 1 from public.appointments a
            join unidades u on u.id = a.branch_id
            where a.client_id = c.id
              and a.professional_id = p_professional_id and a.status <> 'CANCELLED'))
  ),
  da_rede as (
    select r.id, r.name, r.phone, r.visita_antes from do_recorte r where r.created_at < p_desde
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
           -- A unidade da ÚLTIMA VISITA, e só ela: sem visita no sistema, nenhuma (era a do cadastro).
           ult.branch_id as unidade_id
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
             order by x.ultima_visita asc nulls last, x.name, x.id)
      from (
        select * from com_ultima
        order by ultima_visita asc nulls last, name, id
        limit p_limite
        offset greatest(coalesce(p_deslocamento, 0), 0)
      ) x
      left join unidades u on u.id = x.unidade_id
    ), '[]'::jsonb)
  );
$function$;

revoke execute on function public.metrics_clientes_para_reativar_rede(uuid, timestamp with time zone, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.metrics_clientes_para_reativar_rede(uuid, timestamp with time zone, integer, uuid, integer) to service_role;

notify pgrst, 'reload schema';
