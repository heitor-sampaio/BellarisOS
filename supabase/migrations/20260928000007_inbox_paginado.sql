-- O inbox paginado, com filtros e alcance no banco.
--
-- A lista carregava as 200 conversas mais recentes e filtrava no NAVEGADOR: a
-- 201ª não aparecia nunca, e os filtros só enxergavam as 200. No modo "pela
-- conversa" (alcance do SDR), a lista dos leads do dono vinha de um select que
-- o PostgREST corta em 1000 linhas sem avisar — as conversas dos leads além
-- disso sumiam do inbox dele.
--
-- inbox_pagina devolve 30 por vez, já filtrada, com cursor (last_message_at,
-- id). As definições são as MESMAS do navegador (components/admin/
-- inbox-filtros.tsx, passaNosFiltros) e do alcance (lib/inbox/visibilidade.ts):
--  - tags: a PESSOA tem TODAS as marcadas;       donos: QUALQUER um casa;
--  - dono, funil, etapa, "com oportunidade": das oportunidades da PESSOA;
--  - oportunidade sem etapa conta como aberta;   "sem dono" = nenhuma com dono;
--  - busca: nome, telefone, última mensagem e tags da pessoa.
-- O navegador continua conferindo com passaNosFiltros o que chega pelo realtime.
--
-- Recebe a rede e o dono por parâmetro: só o service_role executa (§4).

-- ─── Os leads do dono, num array só (sem o teto de 1000 linhas) ──────────
create or replace function public.leads_do_dono(p_tenant uuid, p_owner uuid)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(l.id), '{}'::uuid[])
  from public.leads l
  where l.tenant_id = p_tenant and l.owner_id = p_owner
$$;

-- ─── A página do inbox ────────────────────────────────────────────────────
create or replace function public.inbox_pagina(
  p_tenant   uuid,
  p_dono     uuid,         -- escopo "só os meus" do CRM; nulo = vê tudo
  p_modo     text,         -- 'pessoa' | 'conversa'
  p_caixas   uuid[],       -- caixas que o cargo vê; nulo = todas
  p_filtros  jsonb,
  p_busca    text,
  p_antes_em timestamptz,  -- cursor: a última da página anterior
  p_antes_id uuid,
  p_limite   int
)
returns table (id uuid, last_message_at timestamptz)
language sql stable security definer set search_path = public
as $$
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
      -- % e _ digitados valem como texto, não como curinga.
      nullif(replace(replace(replace(trim(coalesce(p_busca, '')), '\', '\\'), '%', '\%'), '_', '\_'), '') as v_busca
  )
  select c.id, c.last_message_at
  from public.conversations c, ocultas o, f
  where c.tenant_id = p_tenant
    and c.last_message_at is not null
    -- Alcance do dono (lib/inbox/visibilidade.ts: passaNoAlcanceDoDono).
    and (
      p_dono is null
      or (p_modo = 'conversa' and (c.lead_id is null or exists (
            select 1 from public.leads l where l.id = c.lead_id and l.owner_id = p_dono)))
      or (p_modo <> 'conversa' and (c.contato_id is null or not (c.contato_id = any(o.v_ids))))
    )
    -- Caixas do cargo (passaNasCaixas): conversa sem caixa passa sempre.
    and (p_caixas is null or c.whatsapp_number_id is null or c.whatsapp_number_id = any(p_caixas))
    -- Filtros do painel (passaNosFiltros).
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
         or c.contact_name  ilike '%' || f.v_busca || '%'
         or c.last_message  ilike '%' || f.v_busca || '%'
         or c.contact_phone ilike '%' || f.v_busca || '%'
         or exists (
              select 1 from public.contacts k, unnest(coalesce(k.tags, '{}'::text[])) as v_tag
              where k.id = c.contato_id and v_tag ilike '%' || f.v_busca || '%'))
    -- Cursor: depois da última da página anterior.
    and (p_antes_em is null or (c.last_message_at, c.id) < (p_antes_em, p_antes_id))
  order by c.last_message_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limite, 30), 500))
$$;

-- ─── As opções dos menus de filtro ────────────────────────────────────────
-- Com a lista paginada, derivar as opções das conversas CARREGADAS deixaria o
-- menu sem o dono que só aparece na página 5. Vêm do que está em uso na rede.
create or replace function public.inbox_opcoes(p_tenant uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
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
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.leads_do_dono(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.leads_do_dono(uuid, uuid) to service_role;
revoke execute on function public.inbox_pagina(uuid, uuid, text, uuid[], jsonb, text, timestamptz, uuid, int) from public, anon, authenticated;
grant  execute on function public.inbox_pagina(uuid, uuid, text, uuid[], jsonb, text, timestamptz, uuid, int) to service_role;
revoke execute on function public.inbox_opcoes(uuid) from public, anon, authenticated;
grant  execute on function public.inbox_opcoes(uuid) to service_role;

notify pgrst, 'reload schema';
