-- AU1 (a revisão do Heitor, 2026-11-13: "concordo"): o vencimento de pacote
-- da campanha automática que saiu (MK1) vira o modelo "Vencimento de pacote"
-- das Automações — o relógio todo dia + o passo "Buscar clientes" com
-- "Pacote vence daqui a N dias". O público (`clientes_do_publico`) ganha o
-- filtro: tem um pacote NÃO cancelado (F2b: o cancelado não vence) com
-- `expires_at` no intervalo [pacote_vence_de, pacote_vence_ate] — o dia
-- inteiro no relógio da rede, que o app calcula (`filtrosDaBusca`).
--
-- Do corpo de produção (pg_get_functiondef, 2026-11-14), só com o filtro novo.
-- A função recebe a rede por parâmetro: só service_role (os grants de antes).

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
           (p_filtros->>'min_visitas')::int as min_visitas,
           (p_filtros->>'pacote_vence_de')::timestamptz as pacote_de,
           (p_filtros->>'pacote_vence_ate')::timestamptz as pacote_ate
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
     and (f.pacote_de is null or exists (
           select 1 from public.client_packages cp
            where cp.client_id = c.id
              and cp.cancelado_em is null
              and cp.expires_at >= f.pacote_de
              and cp.expires_at <= coalesce(f.pacote_ate, 'infinity'::timestamptz)))
$function$;

revoke execute on function public.clientes_do_publico(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.clientes_do_publico(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
