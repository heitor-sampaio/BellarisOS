-- F69 — documentos, automações, campanhas, WhatsApp e push (levantamento das
-- regras de 2026-11-11). Tudo ADITIVO: o código no ar segue funcionando.

-- ─── C2: os fatos que nascem no banco disparam automação ─────────────────────
-- Os gatilhos SQL (pagamento, estoque, comissão, termo, pontos) gravam em
-- domain_events com origem 'banco', e ninguém os despachava: só o
-- `emitirEvento` do TS criava execução. O cron de 5 minutos passa a ler os
-- não despachados e REIVINDICA cada um por `despachado_em` (update ... where
-- despachado_em is null): duas passagens juntas criam uma execução só.
alter table public.domain_events add column if not exists despachado_em timestamptz;

-- O que já está no banco NÃO dispara agora: são 30 dias de fatos que nenhuma
-- automação viu nascer (a clínica levaria um lote de avisos velhos de uma vez).
update public.domain_events set despachado_em = now()
 where origem = 'banco' and despachado_em is null;

create index if not exists domain_events_banco_a_despachar
  on public.domain_events (created_at)
  where origem = 'banco' and despachado_em is null;

-- ─── C51: os aparelhos de TODAS as fichas do login ───────────────────────────
-- A mesma pessoa é cliente de duas clínicas com um login só; o celular fica
-- registrado na ficha por onde ela instalou o app. O aviso pessoal já ia a
-- todos (`aparelhos_da_cliente`); a campanha lia pela ficha e não tocava.
create or replace function public.aparelhos_das_clientes(p_clientes uuid[])
returns table (client_id uuid, token text, endpoint text, keys jsonb)
language sql stable security definer set search_path = ''
as $$
  with pedidas as (select distinct unnest(p_clientes) as id),
  dela as (
    select p.id as pedida, p.id as ficha from pedidas p
    union
    select p.id, c2.id
      from pedidas p
      join public.clients c1 on c1.id = p.id and c1.auth_id is not null
      join public.clients c2 on c2.auth_id = c1.auth_id
  )
  select d.pedida, t.token, null::text, null::jsonb
    from dela d join public.push_tokens t on t.client_id = d.ficha
  union all
  select w.* from (
    select distinct on (d.pedida, s.endpoint) d.pedida, null::text, s.endpoint, s.keys
      from dela d join public.web_push_subscriptions s on s.client_id = d.ficha
  ) w
$$;
revoke execute on function public.aparelhos_das_clientes(uuid[]) from public, anon, authenticated;
grant execute on function public.aparelhos_das_clientes(uuid[]) to service_role;

-- O "vai receber no celular" da campanha conta da mesma forma.
create or replace function public.publico_com_aparelho(p_tenant uuid, p_filtros jsonb)
returns integer
language sql stable set search_path = ''
as $$
  select count(*)::integer
    from public.clientes_do_publico(p_tenant, p_filtros) c
   where exists (
     select 1 from public.clients f
      where (f.id = c.id or (c.auth_id is not null and f.auth_id::text = c.auth_id))
        and (exists (select 1 from public.push_tokens t where t.client_id = f.id)
             or exists (select 1 from public.web_push_subscriptions w where w.client_id = f.id))
   )
$$;

-- ─── C55 / C65: a conversa de WhatsApp da cliente — UMA régua ────────────────
-- Pela ficha; sem conversa ligada à ficha, pelo telefone do cadastro (com e
-- sem o 9 do celular). Nunca a de um número removido da clínica (por ela nada
-- sai) nem a encerrada. A mais recente que ELA mandou vem primeiro.
create or replace function public.conversa_de_whatsapp_da_cliente(p_tenant uuid, p_cliente uuid)
returns uuid
language sql stable set search_path = ''
as $$
  with cli as (
    select c.id, regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') as d
      from public.clients c
     where c.id = p_cliente and c.tenant_id = p_tenant
  ),
  fone as (
    select case when length(d) in (10, 11) then '55' || d else d end as e164 from cli
  ),
  variantes as (
    select e164 as v from fone where length(e164) >= 12
    union select substr(e164, 1, 4) || substr(e164, 6) from fone
      where length(e164) = 13 and substr(e164, 5, 1) = '9'
    union select substr(e164, 1, 4) || '9' || substr(e164, 5) from fone
      where length(e164) = 12
  ),
  candidatas as (
    select cv.id, cv.last_inbound_at, cv.last_message_at,
           case when cv.client_id = p_cliente then 0 else 1 end as pela_ficha
      from public.conversations cv
      left join public.whatsapp_numbers n on n.id = cv.whatsapp_number_id
     where cv.tenant_id = p_tenant
       and cv.channel = 'whatsapp'
       and cv.status <> 'closed'
       and (cv.whatsapp_number_id is null or n.removido_em is null)
       and (cv.client_id = p_cliente
            or (cv.client_id is null
                and regexp_replace(coalesce(cv.contact_phone, ''), '\D', '', 'g') in (select v from variantes)))
  )
  select id from candidatas
   order by pela_ficha, last_inbound_at desc nulls last, last_message_at desc nulls last, id
   limit 1
$$;
revoke execute on function public.conversa_de_whatsapp_da_cliente(uuid, uuid) from public, anon, authenticated;
grant execute on function public.conversa_de_whatsapp_da_cliente(uuid, uuid) to service_role;

-- Quantas da busca têm essa conversa (o aviso antes de ligar a automação, C65).
create or replace function public.publico_com_conversa(p_tenant uuid, p_filtros jsonb)
returns integer
language sql stable set search_path = ''
as $$
  select count(*)::integer
    from public.clientes_do_publico(p_tenant, p_filtros) c
   where public.conversa_de_whatsapp_da_cliente(p_tenant, c.id) is not null
$$;
revoke execute on function public.publico_com_conversa(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.publico_com_conversa(uuid, jsonb) to service_role;

-- ─── C56: o aparelho é de uma pessoa OU de uma cliente ───────────────────────
-- Produção: 1 linha, nenhuma com os dois nem com nenhum.
alter table public.push_tokens drop constraint if exists push_tokens_um_dono;
alter table public.push_tokens add constraint push_tokens_um_dono
  check (num_nonnulls(user_id, client_id) = 1);

-- ─── C56: um disparo por campanha, cliente e dia ─────────────────────────────
-- O cron lia os disparos do dia e depois gravava: duas passagens juntas
-- mandavam duas vezes. O índice único é a reivindicação (insert ... on
-- conflict do nothing devolve só as clientes que ESTA passagem pegou).
alter table public.campaign_dispatches
  add column if not exists dia date not null default ((now() at time zone 'America/Sao_Paulo')::date);
create unique index if not exists campaign_dispatches_um_por_dia
  on public.campaign_dispatches (campaign_id, client_id, dia);

-- ─── C72 (H8): as respostas rápidas são de cada pessoa ───────────────────────
-- A sessão não lê nem grava (a action grava pelo servidor, com o autor); o
-- nome é único por pessoa, não na rede.
drop policy if exists quick_replies_tenant on public.quick_replies;
drop index if exists public.uq_quick_replies_titulo;
create unique index if not exists uq_quick_replies_titulo_da_pessoa
  on public.quick_replies (tenant_id, created_by, lower(title));

notify pgrst, 'reload schema';
