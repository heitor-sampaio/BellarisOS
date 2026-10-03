-- Busca universal (a barra de busca da topbar, 2026-10-03).
--
-- Uma função só procura, no banco, tudo o que a barra acha — cliente,
-- oportunidade, agendamento, membro, procedimento, pacote e produto —, até
-- p_limite de cada tipo. As CONVERSAS não estão aqui de propósito: vêm de
-- inbox_pagina, com o mesmo alcance (dono, modo e caixas) da tela do inbox. A
-- regra do inbox continua morando num lugar só.
--
-- Quem decide o que a pessoa pode achar é o SERVIDOR (lib/busca/tipos.ts:
-- tiposPermitidos), a partir do contexto dela: p_tipos, p_unidade,
-- p_crm_dono e p_agenda_dono nunca vêm do navegador. Por isso a função é só
-- do service_role — aberta à sessão, qualquer funcionário passaria a rede de
-- outra clínica por parâmetro (CLAUDE.md §4).
--
-- Sem acento dos dois lados: "joao" acha "João". O inbox passa a comparar do
-- mesmo jeito, senão a barra e o inbox achariam conversas diferentes para o
-- mesmo termo.

create extension if not exists unaccent with schema extensions;

-- unaccent() é STABLE (depende do dicionário padrão); com o dicionário
-- explícito o resultado é fixo, e a função pode ser IMMUTABLE.
create or replace function private.sem_acento(p text)
returns text
language sql immutable parallel safe
set search_path = extensions, pg_temp
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))) $$;

-- Todas as palavras do termo aparecem no alvo, em qualquer ordem: "ana souza"
-- acha "Ana Maria Souza". As palavras já vêm sem acento e escapadas.
create or replace function private.tem_todas(p_alvo text, p_palavras text[])
returns boolean
language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(bool_and(coalesce(p_alvo, '') like '%' || w || '%'), false)
  from unnest(p_palavras) as w
  where w <> ''
$$;

create or replace function public.busca_universal(
  p_tenant      uuid,
  p_termo       text,
  p_tipos       text[],       -- o que a pessoa pode achar (tiposPermitidos)
  p_unidade     uuid default null,  -- abrangência: nulo = a rede inteira
  p_crm_dono    uuid default null,  -- "só os meus" do CRM: a sua ou sem dono
  p_agenda_dono uuid default null,  -- "só os meus" da agenda: professional_id
  p_limite      int  default 5
)
returns table (tipo text, id uuid, titulo text, subtitulo text, extra jsonb)
language sql stable security definer set search_path = public
as $$
  with t as (
    select private.sem_acento(regexp_replace(trim(coalesce(p_termo, '')), '\s+', ' ', 'g')) as v_bruto,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as v_digitos
  ),
  q as (
    select
      -- % e _ digitados valem como texto, não como curinga.
      replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_') as v_esc,
      string_to_array(replace(replace(replace(v_bruto, '\', '\\'), '%', '\%'), '_', '\_'), ' ') as v_palavras,
      -- Termo só de número (telefone, CPF, com ou sem máscara): por dígitos, a
      -- partir de 3 (menos que isso casa tudo).
      case when length(v_digitos) >= 3 and v_bruto !~ '[a-z]' then v_digitos end as v_dig
    from t
    where length(v_bruto) >= 2
  )

  -- Clientes: nome, e-mail, telefone e CPF.
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
                regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || q.v_dig || '%'
             or regexp_replace(coalesce(c.document, ''), '\D', '', 'g') like '%' || q.v_dig || '%')))
   order by (private.sem_acento(c.name) like q.v_esc || '%') desc, c.name
   limit greatest(1, least(coalesce(p_limite, 5), 20)))

  union all

  -- Oportunidades: a regra do funil (leadAoAlcance) — a sua ou sem dono. A de
  -- funil arquivado fica de fora: o quadro não a mostra.
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
          or (q.v_dig is not null
              and regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') like '%' || q.v_dig || '%'))
   order by (coalesce(s.outcome, 'OPEN') = 'OPEN') desc,
            (private.sem_acento(l.name) like q.v_esc || '%') desc,
            l.updated_at desc
   limit greatest(1, least(coalesce(p_limite, 5), 20)))

  union all

  -- Agendamentos: os próximos (de hoje em diante, no fuso da clínica) do
  -- cliente procurado. appointments não tem tenant_id: a rede vem da unidade.
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
          or (q.v_dig is not null
              and regexp_replace(coalesce(cl.phone, ''), '\D', '', 'g') like '%' || q.v_dig || '%'))
   order by a.scheduled_at
   limit greatest(1, least(coalesce(p_limite, 5), 20)))

  union all

  -- Equipe: quem é de unidade vê a dela (como /[slug]/team).
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

  -- Procedimentos: o catálogo da rede mais o da unidade — com a mesma
  -- disponibilidade por unidade da tela /[slug]/procedures (o da rede restrito
  -- a outras unidades não aparece).
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

  -- Produtos: nome, SKU e código de barras.
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
$$;

revoke execute on function public.busca_universal(uuid, text, text[], uuid, uuid, uuid, int)
  from public, anon, authenticated;
grant execute on function public.busca_universal(uuid, text, text[], uuid, uuid, uuid, int)
  to service_role;

-- inbox_pagina: a mesma de 20260928000009, com a cláusula da busca sem acento
-- e o telefone também por dígitos (a conversa guarda o número com máscara ou
-- sem, conforme o canal).
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
      -- Sem acento, e % e _ digitados valem como texto, não como curinga.
      nullif(replace(replace(replace(private.sem_acento(trim(coalesce(p_busca, ''))), '\', '\\'), '%', '\%'), '_', '\_'), '') as v_busca,
      case when length(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g')) >= 3
           then regexp_replace(coalesce(p_busca, ''), '\D', '', 'g') end as v_digitos
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
         or private.sem_acento(c.contact_name) like '%' || f.v_busca || '%'
         -- O nome é da PESSOA (§9.2.1): renomeada no card, é por ele que se procura.
         or exists (select 1 from public.contacts k where k.id = c.contato_id
                    and private.sem_acento(k.name) like '%' || f.v_busca || '%')
         or private.sem_acento(c.last_message) like '%' || f.v_busca || '%'
         or private.sem_acento(c.contact_phone) like '%' || f.v_busca || '%'
         or (f.v_digitos is not null
             and regexp_replace(coalesce(c.contact_phone, ''), '\D', '', 'g') like '%' || f.v_digitos || '%')
         or exists (
              select 1 from public.contacts k, unnest(coalesce(k.tags, '{}'::text[])) as v_tag
              where k.id = c.contato_id and private.sem_acento(v_tag) like '%' || f.v_busca || '%'))
    -- Cursor: depois da última da página anterior.
    and (p_antes_em is null or (c.last_message_at, c.id) < (p_antes_em, p_antes_id))
  order by c.last_message_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limite, 30), 500))
$$;

notify pgrst, 'reload schema';
