-- A busca do inbox casa o telefone pelos DÍGITOS só quando o termo é um
-- telefone, sem letra (2026-10-07). Antes os dígitos soltos de um termo de
-- texto entravam também: "Nome da pessoa muyl997q" achava todo telefone com
-- "997". É a regra que a busca universal já seguia (20261003000001), e a que
-- a tela aplica ao que chega pelo realtime (lib/inbox/busca.ts).
-- Só muda o v_digitos; o resto é a função como estava.

create or replace function public.inbox_pagina(
  p_tenant uuid, p_dono uuid, p_modo text, p_caixas uuid[], p_filtros jsonb,
  p_busca text, p_antes_em timestamp with time zone, p_antes_id uuid, p_limite integer
)
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
