-- O público das campanhas não passa mais pelo schema `private` (2026-10-23).
--
-- `clientes_do_publico` (20261022000002) lia cada filtro de lista por
-- `private.lista_do_filtro`. Quem a chama é o servidor (service role), que NÃO
-- tem `usage` no schema `private`: a função falhava SEMPRE, com 42501
-- "permission denied for schema private" — o cron de aniversário respondia 500.
-- Ninguém no ar a chamava ainda (o código da varredura não tinha subido).
--
-- O filtro passa a ser lido aqui dentro, sem abrir o `private` para ninguém:
-- o array do jsonb, ou nulo se vazio/ausente (`array_agg` de zero linhas é
-- nulo, e o `case` deixa de fora o que não é array).

create or replace function public.clientes_do_publico(p_tenant uuid, p_filtros jsonb)
returns table(id uuid, name text, phone text, auth_id text)
language sql stable set search_path = '' as $$
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
     and (f.sem_retorno_desde is null or not exists (
           select 1 from public.appointments a
            where a.client_id = c.id and a.status = 'COMPLETED'
              and a.scheduled_at >= f.sem_retorno_desde))
$$;

-- O auxiliar não serve a mais ninguém.
drop function if exists private.lista_do_filtro(jsonb);

notify pgrst, 'reload schema';
