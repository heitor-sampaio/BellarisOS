-- O público de uma campanha no fuso da REDE, não no da unidade de cadastro
-- (auditoria das regras, 18/11; o Heitor: "o cliente não é da unidade, o
-- cliente é da rede" — H16; "Nada se prende a clients.branch_id" — CLAUDE.md
-- §5).
--
-- `clientes_do_publico` não recortava a cliente por unidade, mas "sem retorno
-- desde" (a última visita de antes do sistema) e "cliente desde antes de"
-- liam o fuso de `fuso_da_unidade(c.branch_id)` — a unidade em que a ficha
-- nasceu. Agora o fuso da rede (`fuso_do_recorte(p_tenant, null)`, o mesmo de
-- `fusoDaRede` e das contas de "Novos clientes"), calculado uma vez. O resto
-- da função não muda.

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
           (p_filtros->>'pacote_vence_ate')::timestamptz as pacote_ate,
           public.fuso_do_recorte(p_tenant, null) as fuso
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
                or c.ultima_visita_antes::timestamp at time zone f.fuso < f.sem_retorno_desde)))
     and (f.cliente_desde_antes is null
          or coalesce(c.cliente_desde::timestamp at time zone f.fuso, c.created_at) < f.cliente_desde_antes)
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

revoke all on function public.clientes_do_publico(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.clientes_do_publico(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
