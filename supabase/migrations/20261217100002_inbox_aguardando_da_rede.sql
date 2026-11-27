-- D6 da 38ª simulação (2026-11-27): a faixa "30 aguardando resposta" do inbox
-- contava só as conversas CARREGADAS (a lista vem de 30 em 30), e o banco tinha
-- 44. crm-inbox:IN-10 ("filtro, busca e as opções dos menus alcançam a rede
-- inteira, não só as conversas carregadas"), princípio 3.
--
-- A contagem vem do banco, com o MESMO alcance (as caixas do cargo) e os
-- MESMOS filtros e busca da lista, sem o corte da página. Para a regra do
-- filtro continuar num lugar só (era o aviso de `inbox_pagina`: duas cópias
-- divergem), o filtro sai para `private.inbox_filtradas` — o corpo de
-- `inbox_pagina` como está na produção, sem o cursor, a ordem e o corte — e
-- as duas leem dele:
--  - `public.inbox_pagina`: a mesma assinatura e o mesmo resultado (o cursor
--    `(last_message_at, id)`, a ordem e o corte de 500);
--  - `public.inbox_aguardando`: quantas aguardam resposta e desde quando a
--    mais antiga espera (a cor da faixa, que também era das carregadas).
-- A função privada é SQL `stable` sem `security definer` nem `set`: o
-- planejador a expande dentro de quem a chama (a página não fica mais lenta).

create or replace function private.inbox_filtradas(
  p_tenant uuid, p_dono uuid, p_modo text, p_caixas uuid[], p_filtros jsonb, p_busca text
)
returns table(id uuid, last_message_at timestamptz, awaiting_since timestamptz)
language sql
stable
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
  select c.id, c.last_message_at, c.awaiting_since
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
    and (f.v_palavras is null
         or private.tem_todas(private.sem_acento(concat_ws(' ',
              c.contact_name,
              (select k.name from public.contacts k where k.id = c.contato_id),
              c.last_message,
              c.contact_phone,
              (select array_to_string(k.tags, ' ') from public.contacts k where k.id = c.contato_id))), f.v_palavras)
         or (f.v_digitos is not null and private.telefone_casa(c.contact_phone, f.v_digitos)))
$function$;

revoke all on function private.inbox_filtradas(uuid, uuid, text, uuid[], jsonb, text) from public, anon, authenticated;
grant execute on function private.inbox_filtradas(uuid, uuid, text, uuid[], jsonb, text) to service_role;

create or replace function public.inbox_pagina(p_tenant uuid, p_dono uuid, p_modo text, p_caixas uuid[], p_filtros jsonb, p_busca text, p_antes_em timestamp with time zone, p_antes_id uuid, p_limite integer)
 returns table(id uuid, last_message_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select c.id, c.last_message_at
  from private.inbox_filtradas(p_tenant, p_dono, p_modo, p_caixas, p_filtros, p_busca) c
  where (p_antes_em is null or (c.last_message_at, c.id) < (p_antes_em, p_antes_id))
  order by c.last_message_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limite, 30), 500))
$function$;

create or replace function public.inbox_aguardando(p_tenant uuid, p_dono uuid, p_modo text, p_caixas uuid[], p_filtros jsonb, p_busca text)
 returns table(total integer, desde timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select count(*)::int, min(c.awaiting_since)
  from private.inbox_filtradas(p_tenant, p_dono, p_modo, p_caixas, p_filtros, p_busca) c
  where c.awaiting_since is not null
$function$;

revoke all on function public.inbox_aguardando(uuid, uuid, text, uuid[], jsonb, text) from public, anon, authenticated;
grant execute on function public.inbox_aguardando(uuid, uuid, text, uuid[], jsonb, text) to service_role;

notify pgrst, 'reload schema';
