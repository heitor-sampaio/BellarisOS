-- D6 da 8ª simulação (2026-11-06): a busca de cliente numa regra só.
--
-- A lista de Clientes e o modal Agendar (`buscar_clientes`) não ignoravam
-- acento ("Zelia" não achava "Zélia"), e o Ctrl K (`busca_universal`) não
-- achava o número digitado com o 55 do WhatsApp — e oferecia "Cadastrar …
-- como cliente", a ficha em dobro. O telefone da ficha fica como foi
-- digitado ("guarda o que foi digitado", com máscara ou só dígitos), por
-- isso a comparação é por DÍGITOS, com o 55 e o nono dígito do celular
-- tolerados — como as comparações do cadastro (`variantesDoTelefone`).
--
-- A regra do telefone é UMA, `private.telefone_casa(telefone, digitos)`
-- (espelho em TypeScript: `telefoneCasaComDigitos`, lib/busca/cliente.ts):
-- casa quando os dígitos gravados contêm os digitados; ou, sem o 55 dos dois
-- lados, o nacional contém o nacional; ou, sem o nono dígito do celular dos
-- dois lados, um contém o outro. Partindo dos corpos ATUAIS da produção.

create or replace function private.telefone_nacional(p text)
returns text
language sql
immutable parallel safe
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select case when length(d) in (12, 13) and d like '55%' then substr(d, 3) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

create or replace function private.telefone_sem_nono(p text)
returns text
language sql
immutable parallel safe
set search_path to 'pg_catalog', 'pg_temp'
as $$
  -- p: dígitos nacionais. O celular com DDD (11 dígitos, o 3º é o 9) perde o 9.
  select case when length(p) = 11 and substr(p, 3, 1) = '9' then substr(p, 1, 2) || substr(p, 4) else p end
$$;

create or replace function private.telefone_casa(p_telefone text, p_digitos text)
returns boolean
language sql
immutable parallel safe
set search_path to 'pg_catalog', 'private', 'pg_temp'
as $$
  select coalesce(p_digitos, '') ~ '^\d{3,}$' and (
       g.tel like '%' || p_digitos || '%'
    or (length(t.nac) >= 3 and g.nac like '%' || t.nac || '%')
    or (length(t.nac) >= 3 and private.telefone_sem_nono(g.nac) like '%' || private.telefone_sem_nono(t.nac) || '%')
  )
  from (select regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') as tel,
               private.telefone_nacional(p_telefone) as nac) g,
       (select private.telefone_nacional(p_digitos) as nac) t
$$;

-- O modal Agendar: a regra da busca universal (sem acento, todas as palavras,
-- o telefone por dígitos) — era `name ilike` e o telefone cru.
create or replace function public.buscar_clientes(p_tenant uuid, p_termo text, p_limite integer default 10)
 returns table(id uuid, name text, phone text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with t as (
    select private.sem_acento(regexp_replace(trim(coalesce(p_termo, '')), '\s+', ' ', 'g')) as v_bruto,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as v_digitos
  ),
  q as (
    select
      replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_') as v_esc,
      string_to_array(replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_'), ' ') as v_palavras,
      case when length(v_digitos) >= 3 and v_bruto !~ '[a-z]' then v_digitos end as v_dig
    from t
    where length(v_bruto) >= 2
  )
  select c.id, c.name, c.phone
  from clients c, q
  where c.tenant_id = p_tenant
    and c.is_active
    and (private.tem_todas(private.sem_acento(concat_ws(' ', c.name, c.email,
           regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'))), q.v_palavras)
         or (q.v_dig is not null and private.telefone_casa(c.phone, q.v_dig)))
  order by (private.sem_acento(c.name) like q.v_esc || '%') desc, c.name
  limit greatest(1, least(p_limite, 50))
$function$;

create or replace function public.busca_universal(p_tenant uuid, p_termo text, p_tipos text[], p_unidade uuid default null::uuid, p_crm_dono uuid default null::uuid, p_agenda_dono uuid default null::uuid, p_limite integer default 5)
 returns table(tipo text, id uuid, titulo text, subtitulo text, extra jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with t as (
    select private.sem_acento(regexp_replace(trim(coalesce(p_termo, '')), '\s+', ' ', 'g')) as v_bruto,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as v_digitos
  ),
  q as (
    select
      replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_') as v_esc,
      string_to_array(replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_'), ' ') as v_palavras,
      case when length(v_digitos) >= 3 and v_bruto !~ '[a-z]' then v_digitos end as v_dig
    from t
    where length(v_bruto) >= 2
  )

  (select 'cliente'::text, c.id, c.name, c.phone,
          jsonb_build_object('email', c.email)
   from public.clients c, q
   where 'cliente' = any(p_tipos)
     and c.tenant_id = p_tenant
     and c.is_active
     and (private.tem_todas(private.sem_acento(concat_ws(' ', c.name, c.email,
            regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'),
            regexp_replace(coalesce(c.document, ''), '\D', '', 'g'))), q.v_palavras)
          or (q.v_dig is not null and (
                private.telefone_casa(c.phone, q.v_dig)
             or regexp_replace(coalesce(c.document, ''), '\D', '', 'g') like '%' || q.v_dig || '%')))
   order by (private.sem_acento(c.name) like q.v_esc || '%') desc, c.name
   limit greatest(1, least(coalesce(p_limite, 5), 20)))

  union all

  (select 'oportunidade'::text, l.id, l.name::text, s.name::text,
          jsonb_build_object(
            'funilId',  s.funnel_id,
            'desfecho', s.outcome,
            'dono',     u.name)
   from public.leads l
   left join public.crm_stages s on s.id = l.crm_stage_id
   left join public.crm_funnels fu on fu.id = s.funnel_id
   left join public.users u on u.id = l.owner_id
   cross join q
   where 'oportunidade' = any(p_tipos)
     and l.tenant_id = p_tenant
     and fu.archived_at is null
     and (p_crm_dono is null or l.owner_id is null or l.owner_id = p_crm_dono)
     and (private.tem_todas(private.sem_acento(concat_ws(' ', l.name, l.email,
            regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'))), q.v_palavras)
          or (q.v_dig is not null and private.telefone_casa(l.phone, q.v_dig)))
   order by (coalesce(s.outcome, 'OPEN') = 'OPEN') desc,
            (private.sem_acento(l.name) like q.v_esc || '%') desc,
            l.updated_at desc
   limit greatest(1, least(coalesce(p_limite, 5), 20)))

  union all

  (select 'agendamento'::text, a.id, cl.name, pr.name,
          jsonb_build_object(
            'quando',       a.scheduled_at,
            'status',       a.status,
            'profissional', u.name,
            'unidade',      b.name)
   from public.appointments a
   join public.branches b  on b.id = a.branch_id and b.tenant_id = p_tenant
   join public.clients  cl on cl.id = a.client_id
   left join public.procedures pr on pr.id = a.procedure_id
   left join public.users u on u.id = a.professional_id
   cross join q
   where 'agendamento' = any(p_tipos)
     and a.scheduled_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
     and a.status::text <> 'CANCELLED'
     and (p_unidade is null or a.branch_id = p_unidade)
     and (p_agenda_dono is null or a.professional_id = p_agenda_dono)
     and (private.tem_todas(private.sem_acento(concat_ws(' ', cl.name,
            regexp_replace(coalesce(cl.phone, ''), '\D', '', 'g'))), q.v_palavras)
          or (q.v_dig is not null and private.telefone_casa(cl.phone, q.v_dig)))
   order by a.scheduled_at
   limit greatest(1, least(coalesce(p_limite, 5), 20)))

  union all

  (select 'membro'::text, u.id, u.name, r.label,
          jsonb_build_object('email', u.email, 'ativo', u.is_active, 'unidade', b.name)
   from public.users u
   left join public.tenant_roles r on r.id = u.role_id
   left join public.branches b on b.id = u.branch_id
   cross join q
   where 'membro' = any(p_tipos)
     and u.tenant_id = p_tenant
     and (p_unidade is null or u.branch_id = p_unidade)
     and private.tem_todas(private.sem_acento(concat_ws(' ', u.name, u.email)), q.v_palavras)
   order by u.is_active desc, (private.sem_acento(u.name) like q.v_esc || '%') desc, u.name
   limit greatest(1, least(coalesce(p_limite, 5), 20)))

  union all

  (select 'procedimento'::text, p.id, p.name, p.category,
          jsonb_build_object('preco', p.price, 'duracao', p.duration_min)
   from public.procedures p, q
   where 'procedimento' = any(p_tipos)
     and p.tenant_id = p_tenant
     and p.is_active
     and (p_unidade is null or p.branch_id = p_unidade or (
            p.branch_id is null and (
              not exists (select 1 from public.procedure_branch_availability av where av.procedure_id = p.id)
              or exists (select 1 from public.procedure_branch_availability av
                         where av.procedure_id = p.id and av.branch_id = p_unidade))))
     and private.tem_todas(private.sem_acento(concat_ws(' ', p.name, p.category)), q.v_palavras)
   order by (private.sem_acento(p.name) like q.v_esc || '%') desc, p.name
   limit greatest(1, least(coalesce(p_limite, 5), 20)))

  union all

  (select 'pacote'::text, sp.id, sp.name, null::text,
          jsonb_build_object('preco', sp.price, 'sessoes', sp.total_sessions)
   from public.service_packages sp, q
   where 'pacote' = any(p_tipos)
     and sp.tenant_id = p_tenant
     and sp.is_active
     and (p_unidade is null or sp.branch_id is null or sp.branch_id = p_unidade)
     and private.tem_todas(private.sem_acento(sp.name), q.v_palavras)
   order by (private.sem_acento(sp.name) like q.v_esc || '%') desc, sp.name
   limit greatest(1, least(coalesce(p_limite, 5), 20)))

  union all

  (select 'produto'::text, pd.id, pd.name, pd.category,
          jsonb_build_object('sku', pd.sku, 'unidadeDeMedida', pd.unit)
   from public.products pd, q
   where 'produto' = any(p_tipos)
     and pd.tenant_id = p_tenant
     and pd.is_active
     and (p_unidade is null or pd.branch_id is null or pd.branch_id = p_unidade)
     and private.tem_todas(private.sem_acento(concat_ws(' ', pd.name, pd.sku, pd.barcode)), q.v_palavras)
   order by (private.sem_acento(pd.name) like q.v_esc || '%') desc, pd.name
   limit greatest(1, least(coalesce(p_limite, 5), 20)))
$function$;

create or replace function public.busca_clientes_arquivados(p_tenant uuid, p_termo text, p_limite integer default 5)
 returns table(id uuid, titulo text, subtitulo text, extra jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with t as (
    select private.sem_acento(regexp_replace(trim(coalesce(p_termo, '')), '\s+', ' ', 'g')) as v_bruto,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as v_digitos
  ),
  q as (
    select
      replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_') as v_esc,
      string_to_array(replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_'), ' ') as v_palavras,
      case when length(v_digitos) >= 3 and v_bruto !~ '[a-z]' then v_digitos end as v_dig
    from t
    where length(v_bruto) >= 2
  )
  select c.id, c.name, c.phone, jsonb_build_object('email', c.email, 'arquivada', true)
  from public.clients c, q
  where c.tenant_id = p_tenant
    and not c.is_active
    and (private.tem_todas(private.sem_acento(concat_ws(' ', c.name, c.email,
           regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'),
           regexp_replace(coalesce(c.document, ''), '\D', '', 'g'))), q.v_palavras)
         or (q.v_dig is not null and (
               private.telefone_casa(c.phone, q.v_dig)
            or regexp_replace(coalesce(c.document, ''), '\D', '', 'g') like '%' || q.v_dig || '%')))
  order by (private.sem_acento(c.name) like q.v_esc || '%') desc, c.name
  limit greatest(1, least(coalesce(p_limite, 5), 20))
$function$;

create or replace function public.busca_pessoas_sem_oportunidade(p_tenant uuid, p_termo text, p_limite integer default 5)
 returns table(id uuid, titulo text, subtitulo text, extra jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with t as (
    select private.sem_acento(regexp_replace(trim(coalesce(p_termo, '')), '\s+', ' ', 'g')) as v_bruto,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as v_digitos
  ),
  q as (
    select
      replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_') as v_esc,
      string_to_array(replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_'), ' ') as v_palavras,
      case when length(v_digitos) >= 3 and v_bruto !~ '[a-z]' then v_digitos end as v_dig
    from t
    where length(v_bruto) >= 2
  )
  select k.id, k.name, k.phone, jsonb_build_object('email', k.email)
  from public.contacts k, q
  where k.tenant_id = p_tenant
    and not exists (select 1 from public.leads l where l.contato_id = k.id)
    and not exists (select 1 from public.conversations c where c.contato_id = k.id)
    and (private.tem_todas(private.sem_acento(concat_ws(' ', k.name, k.email,
           regexp_replace(coalesce(k.phone, ''), '\D', '', 'g'))), q.v_palavras)
         or (q.v_dig is not null and private.telefone_casa(k.phone, q.v_dig)))
  order by (private.sem_acento(coalesce(k.name, '')) like q.v_esc || '%') desc, k.name
  limit greatest(1, least(coalesce(p_limite, 5), 20))
$function$;

notify pgrst, 'reload schema';
