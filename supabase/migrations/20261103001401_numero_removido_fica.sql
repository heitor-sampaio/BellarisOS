-- r2-cfg-06 (o Heitor, 2026-11-03): remover um número de WhatsApp NÃO junta
-- mais as conversas — "não tem como juntar duas conversas em uma só e manter
-- alguma coerência, ela estava falando com pessoas diferentes … mantém as duas
-- conversas no inbox, porque o inbox é uma visualização unificada de todos os
-- inbox; se a pessoa quiser, existem os filtros para isso".
--
-- Apagar a linha do número punha as conversas dele em "sem número" (ON DELETE
-- SET NULL), e a da pessoa que já tinha uma conversa sem número colidia no
-- índice único desse ramo — era por isso que a F7c juntava. Agora o número
-- removido FICA, marcado (`removido_em`), fora do ar, sem a credencial e sem
-- o phone_number_id (lib/whatsapp/remover.ts): as conversas dele continuam
-- apontando para ele, cada uma com as mensagens e o card dela, e nada colide.
-- O app o tira das Configurações e da escolha de saída; o inbox o mostra como
-- "· número removido", inclusive no filtro "Número" (novo, abaixo).

alter table public.whatsapp_numbers add column if not exists removido_em timestamptz;
comment on column public.whatsapp_numbers.removido_em is
  'O número foi removido da clínica (r2-cfg-06): fica para as conversas dele continuarem como estão. Fora do ar, sem credencial; fora das Configurações e da escolha de saída.';

-- As opções do inbox ganham os NÚMEROS: os da clínica e os removidos que
-- ainda têm conversa ("se a pessoa quiser, existem os filtros para isso").
create or replace function public.inbox_opcoes(p_tenant uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'donos', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.name) order by u.name)
      from public.users u
      where u.tenant_id = p_tenant
        and exists (select 1 from public.leads l where l.tenant_id = p_tenant and l.owner_id = u.id)
    ), '[]'::jsonb),
    'funis', coalesce((
      select jsonb_agg(jsonb_build_object('id', fu.id, 'nome', fu.name) order by fu.name)
      from public.crm_funnels fu
      where fu.tenant_id = p_tenant and fu.archived_at is null
    ), '[]'::jsonb),
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.name, 'funil', s.funnel_id) order by s.position)
      from public.crm_stages s join public.crm_funnels fu on fu.id = s.funnel_id
      where s.tenant_id = p_tenant and fu.archived_at is null
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(v_tag order by v_tag) from (
        select distinct unnest(k.tags) as v_tag from public.contacts k where k.tenant_id = p_tenant
      ) t
    ), '[]'::jsonb),
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'nome', b.name) order by b.name)
      from public.branches b where b.tenant_id = p_tenant and b.is_active
    ), '[]'::jsonb),
    'numeros', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'nome', n.label, 'removido', n.removido_em is not null)
                       order by (n.removido_em is not null), n.label)
      from public.whatsapp_numbers n
      where n.tenant_id = p_tenant
        and (n.removido_em is null
             or exists (select 1 from public.conversations c where c.tenant_id = p_tenant and c.whatsapp_number_id = n.id))
    ), '[]'::jsonb)
  )
$function$;

-- A página do inbox filtra também pelo NÚMERO (`p_filtros->'numeros'`, os ids):
-- o mesmo corte de `passaNosFiltros` (components/admin/inbox-filtros.tsx) —
-- as duas definições continuam iguais. O resto é o corpo de produção.
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
      nullif(replace(replace(replace(private.sem_acento(trim(coalesce(p_busca, ''))), '\', '\\'), '%', '\%'), '_', '\_'), '') as v_busca,
      case when length(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g')) >= 3
            and private.sem_acento(coalesce(p_busca, '')) !~ '[a-z]'
           then regexp_replace(coalesce(p_busca, ''), '\D', '', 'g') end as v_digitos
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
    and (f.v_busca is null
         or private.sem_acento(c.contact_name) like '%' || f.v_busca || '%'
         or exists (select 1 from public.contacts k where k.id = c.contato_id
                    and private.sem_acento(k.name) like '%' || f.v_busca || '%')
         or private.sem_acento(c.last_message) like '%' || f.v_busca || '%'
         or private.sem_acento(c.contact_phone) like '%' || f.v_busca || '%'
         or (f.v_digitos is not null
             and regexp_replace(coalesce(c.contact_phone, ''), '\D', '', 'g') like '%' || f.v_digitos || '%')
         or exists (
              select 1 from public.contacts k, unnest(coalesce(k.tags, '{}'::text[])) as v_tag
              where k.id = c.contato_id and private.sem_acento(v_tag) like '%' || f.v_busca || '%'))
    and (p_antes_em is null or (c.last_message_at, c.id) < (p_antes_em, p_antes_id))
  order by c.last_message_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limite, 30), 500))
$function$;

notify pgrst, 'reload schema';
