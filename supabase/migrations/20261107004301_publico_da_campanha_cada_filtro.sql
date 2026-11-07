-- D1 da 9ª simulação (2026-11-07): cada regra gravada da campanha chega ao
-- público. Três filtros novos em clientes_do_publico (partindo do corpo atual
-- da produção):
--   cliente_desde_antes  a cliente da clínica de ANTES deste instante
--                        (coalesce(cliente_desde, created_at)) — a "Sem visita
--                        há mais de 60 dias" não é a cadastrada ontem; a mesma
--                        régua do "Reativar clientes" (indicadores.md).
--   min_visitas          ao menos N atendimentos concluídos ("Com ao menos N
--                        visitas", que o resumo da campanha já dizia).
--   client_ids           o recorte das campanhas automáticas que escolhem a
--                        cliente pelo fato (a visita de N dias atrás, o
--                        horário daqui a N horas, o pacote vencendo): o público
--                        delas é ESSAS clientes, com as regras da campanha.
-- Os filtros que já existiam não mudam.

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
     and (f.cliente_desde_antes is null
          or coalesce(c.cliente_desde::timestamp at time zone 'America/Sao_Paulo', c.created_at) < f.cliente_desde_antes)
     and (f.min_visitas is null or (
           select count(*) from public.appointments a
            where a.client_id = c.id and a.status = 'COMPLETED') >= f.min_visitas)
$function$;

notify pgrst, 'reload schema';
