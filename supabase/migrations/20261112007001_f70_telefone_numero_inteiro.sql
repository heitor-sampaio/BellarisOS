-- F70 — C28 e C31 do levantamento das regras (2026-11-12).
--
-- C28: `cliente_por_telefone`, `fichas_do_telefone` e o ramo de telefone de
-- `importacao_cruzamento` comparavam só os 8 ÚLTIMOS dígitos — o DDD ficava
-- de fora, e o número de outra cidade com os mesmos 8 finais era "a mesma
-- ficha" no webhook, no cadastro, no D11 e no Copilot. Passam a usar a regra
-- única do telefone (`private.telefone_casa`, D6 da 8ª: o 55 do WhatsApp e o
-- nono dígito do celular tolerados) com o número INTEIRO (pelo menos 10
-- dígitos: o DDD e o número).
--
-- C31: a busca do inbox (`inbox_pagina`) não seguia a regra da busca de
-- cliente: as palavras tinham de vir na ordem ("informações cris" não achava
-- a Cris), e o telefone não tolerava o 55 nem o nono dígito. Agora é
-- `private.tem_todas` e `private.telefone_casa`, como `buscar_clientes`. O
-- espelho no navegador é `conversaCasaComBusca` (lib/inbox/busca.ts).
--
-- Só troca o corpo das funções (mesmas assinaturas, mesmas permissões).

create or replace function public.cliente_por_telefone(p_tenant uuid, p_digitos text, p_sem_cpf boolean default false)
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select c.id
  from clients c
  where c.tenant_id = p_tenant
    and length(regexp_replace(coalesce(p_digitos, ''), '\D', '', 'g')) >= 10
    and private.telefone_casa(c.phone, regexp_replace(p_digitos, '\D', '', 'g'))
    and (not p_sem_cpf or c.document is null)
  order by c.created_at
  limit 1
$function$;

create or replace function public.fichas_do_telefone(p_tenant uuid, p_digitos text)
 returns table(id uuid, nome text, ativa boolean, sem_cpf boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select c.id, c.name, c.is_active, c.document is null
  from clients c
  where c.tenant_id = p_tenant
    and length(regexp_replace(coalesce(p_digitos, ''), '\D', '', 'g')) >= 10
    and private.telefone_casa(c.phone, regexp_replace(p_digitos, '\D', '', 'g'))
  order by c.created_at, c.id
  limit 20
$function$;

create or replace function public.importacao_cruzamento(p_tenant uuid, p_destino text, p_linhas jsonb)
 returns table(numero integer, id uuid, nome text, como text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with l as (
    select x.numero, nullif(x.cpf, '') as cpf, nullif(x.fone, '') as fone, coalesce(x.fones, '{}') as fones, nullif(lower(x.email), '') as email
    from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(numero integer, cpf text, fone text, fones text[], email text)
  )
  select l.numero, m.id, m.nome, m.como
  from l
  cross join lateral (
    select * from (
      (select c.id, c.name as nome, 'cpf'::text as como, 1 as ordem
       from clients c
       where p_destino = 'clientes' and l.cpf is not null and c.tenant_id = p_tenant and c.document = l.cpf
       limit 1)
      union all
      (select c.id, c.name, 'telefone', 2
       from clients c
       where p_destino = 'clientes' and l.fone is not null and length(regexp_replace(l.fone, '\D', '', 'g')) >= 10
         and c.tenant_id = p_tenant and c.document is null
         and private.telefone_casa(c.phone, regexp_replace(l.fone, '\D', '', 'g'))
       order by c.created_at
       limit 1)
      union all
      (select ct.id, coalesce(ct.name, ct.phone), 'telefone', 3
       from contacts ct
       where p_destino = 'contatos' and l.fone is not null and ct.tenant_id = p_tenant and ct.identifiers && l.fones
       order by ct.created_at
       limit 1)
      union all
      (select ct.id, coalesce(ct.name, ct.email), 'email', 4
       from contacts ct
       where p_destino = 'contatos' and l.fone is null and l.email is not null and ct.tenant_id = p_tenant and lower(ct.email) = l.email
       order by ct.created_at
       limit 1)
    ) achados
    order by ordem
    limit 1
  ) m
$function$;

create or replace function public.inbox_pagina(p_tenant uuid, p_dono uuid, p_modo text, p_caixas uuid[], p_filtros jsonb, p_busca text, p_antes_em timestamp with time zone, p_antes_id uuid, p_limite integer)
 returns table(id uuid, last_message_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with ocultas as (
    select case
      when p_dono is not null and p_modo <> 'conversa'
        then coalesce(public.contatos_ocultos_do_dono(p_tenant, p_dono), '{}'::uuid[])
      else '{}'::uuid[]
    end as v_ids
  ),
  t as (
    select private.sem_acento(regexp_replace(trim(coalesce(p_busca, '')), '\s+', ' ', 'g')) as v_bruto,
           regexp_replace(coalesce(p_busca, ''), '\D', '', 'g') as v_dig_brutos
  ),
  f as (
    select
      coalesce(p_filtros->>'canal', 'all')                       as v_canal,
      coalesce(p_filtros->>'status', 'todos')                    as v_status,
      coalesce((p_filtros->>'naoLidas')::boolean, false)         as v_nao_lidas,
      coalesce((p_filtros->>'aguardando')::boolean, false)       as v_aguardando,
      coalesce(p_filtros->>'cliente', 'todos')                   as v_cliente,
      coalesce((p_filtros->>'comOportunidade')::boolean, false)  as v_com_op,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_filtros->'tags', '[]'::jsonb))), '{}'::text[])  as v_tags,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_filtros->'donos', '[]'::jsonb))), '{}'::text[]) as v_donos,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_filtros->'numeros', '[]'::jsonb))), '{}'::text[]) as v_numeros,
      coalesce(p_filtros->>'funil', 'todos')                     as v_funil,
      coalesce(p_filtros->>'etapa', 'todas')                     as v_etapa,
      coalesce(p_filtros->>'unidade', 'todas')                   as v_unidade,
      case when t.v_bruto <> ''
           then string_to_array(replace(replace(replace(t.v_bruto, '\', '\\'), '%', '\%'), '_', '\_'), ' ') end as v_palavras,
      case when length(t.v_dig_brutos) >= 3 and t.v_bruto !~ '[a-z]'
           then t.v_dig_brutos end as v_digitos
    from t
  )
  select c.id, c.last_message_at
  from public.conversations c, ocultas o, f
  where c.tenant_id = p_tenant
    and c.last_message_at is not null
    and (
      p_dono is null
      or (p_modo = 'conversa' and (c.lead_id is null or exists (
            select 1 from public.leads l where l.id = c.lead_id and l.owner_id = p_dono)))
      or (p_modo <> 'conversa' and (c.contato_id is null or not (c.contato_id = any(o.v_ids))))
    )
    and (p_caixas is null or c.whatsapp_number_id is null or c.whatsapp_number_id = any(p_caixas))
    and (f.v_canal = 'all' or c.channel::text = f.v_canal)
    and (f.v_status = 'todos' or c.status::text = f.v_status)
    and (not f.v_nao_lidas or c.unread_count > 0)
    and (not f.v_aguardando or c.awaiting_since is not null)
    and (f.v_cliente = 'todos' or (f.v_cliente = 'sim') = (c.client_id is not null))
    and (cardinality(f.v_numeros) = 0 or c.whatsapp_number_id::text = any(f.v_numeros))
    and (f.v_unidade = 'todas'
         or (f.v_unidade = '__rede__' and c.branch_id is null)
         or c.branch_id::text = f.v_unidade)
    and (cardinality(f.v_tags) = 0 or exists (
          select 1 from public.contacts k
          where k.id = c.contato_id and coalesce(k.tags, '{}'::text[]) @> f.v_tags))
    and (not f.v_com_op or exists (
          select 1 from public.leads l left join public.crm_stages s on s.id = l.crm_stage_id
          where l.tenant_id = p_tenant and l.contato_id = c.contato_id
            and (s.id is null or s.outcome = 'OPEN')))
    and (cardinality(f.v_donos) = 0
         or ('__sem_dono__' = any(f.v_donos) and not exists (
               select 1 from public.leads l
               where l.tenant_id = p_tenant and l.contato_id = c.contato_id and l.owner_id is not null))
         or exists (
               select 1 from public.leads l
               where l.tenant_id = p_tenant and l.contato_id = c.contato_id and l.owner_id::text = any(f.v_donos)))
    and (f.v_funil = 'todos' or exists (
          select 1 from public.leads l join public.crm_stages s on s.id = l.crm_stage_id
          where l.tenant_id = p_tenant and l.contato_id = c.contato_id and s.funnel_id::text = f.v_funil))
    and (f.v_etapa = 'todas' or exists (
          select 1 from public.leads l
          where l.tenant_id = p_tenant and l.contato_id = c.contato_id and l.crm_stage_id::text = f.v_etapa))
    -- A busca: todas as palavras, em qualquer ordem, no nome (da conversa e
    -- da pessoa), na última mensagem, no telefone e nas tags da pessoa; ou o
    -- telefone pelos dígitos, com o 55 e o nono dígito tolerados.
    and (f.v_palavras is null
         or private.tem_todas(private.sem_acento(concat_ws(' ',
              c.contact_name,
              (select k.name from public.contacts k where k.id = c.contato_id),
              c.last_message,
              c.contact_phone,
              (select array_to_string(k.tags, ' ') from public.contacts k where k.id = c.contato_id))), f.v_palavras)
         or (f.v_digitos is not null and private.telefone_casa(c.contact_phone, f.v_digitos)))
    and (p_antes_em is null or (c.last_message_at, c.id) < (p_antes_em, p_antes_id))
  order by c.last_message_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limite, 30), 500))
$function$;

notify pgrst, 'reload schema';
