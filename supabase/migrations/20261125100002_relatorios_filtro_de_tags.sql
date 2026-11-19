-- O filtro de Tags nos Relatórios.
--
-- A regra (CLAUDE.md §1, o Heitor, 13/11): "onde tiver for passível de
-- filtro, um dos filtros que ela pode usar são as tags … além dos filtros que
-- a gente já apresenta ali fixos em cada página." Nenhuma aba dos Relatórios
-- tinha o filtro, e nenhuma `metrics_*` aceitava tag.
--
-- Decisões do Claude (princípios 3 e 7), as mesmas da lista de Clientes e do
-- inbox:
-- - a tag filtra PESSOAS: a linha entra se a cliente dela (`clients.tags`) —
--   na aba Oportunidades, a PESSOA da oportunidade — tem TODAS as tags
--   marcadas (E), sem distinguir a caixa ("VIP" e "vip" são a mesma tag). A
--   oportunidade não tem tag própria (o Heitor, 18/11: "a tag é da pessoa e
--   pode ter mais de uma tag"): vale a ficha da cliente ligada
--   (`leads.client_id` → `clients.tags`) e, sem cliente, o contato
--   (`leads.contato_id` → `contacts.tags`). Isso mora num lugar só,
--   `public.metrics_tags_da_pessoa_da_oportunidade`, que a unificação das
--   colunas de tag troca sem mexer no resto; `leads.tags` não é lida;
-- - a linha sem cliente (a despesa, a comissão de ajuste sem atendimento nem
--   lançamento) sai quando há tag marcada;
-- - o filtro só existe nas abas de pessoas — Vendas, Agenda, Clientes,
--   Procedimentos, Profissionais e Oportunidades. As funções da Visão geral, do
--   Financeiro (despesa, DRE e lucro) e do Estoque não o recebem da tela.
--
-- Como vale (na consulta, nunca filtrando um lote já lido — CLAUDE.md §14):
-- - duas réguas, uma conta só: `public.metrics_tem_as_tags(tags da pessoa,
--   tags marcadas)` e `public.metrics_cliente_tem_as_tags(cliente, tags)`;
--   sem tag marcada, as duas dizem "sim" e nada muda;
-- - cada função da aba ganha `p_tags text[] default null` no FIM da
--   assinatura (as chamadas de antes, com nome ou por posição, seguem iguais) e
--   a régua no lugar em que a linha encontra a cliente: o agendamento
--   (`appointments.client_id`), o lançamento (`financial_transactions.client_id`),
--   a venda (`cliente_id`), a comissão (a cliente do atendimento, ou a do
--   lançamento), a ficha (`clients.tags`) e a pessoa da oportunidade. Os
--   agendamentos do COMERCIAL (aba Oportunidades) não têm oportunidade ligada:
--   seguem a cliente do agendamento.
--
-- Troca de texto sobre o corpo VIVO de cada função (conferido na produção em
-- 18/11, DEPOIS da 20261125100001 nas de vendas): cada trecho tem de aparecer o
-- número de vezes esperado, ou a migration para. Trechos de uma linha só. A
-- assinatura muda (um parâmetro a mais): a função velha sai (`drop`) e a nova
-- nasce do corpo trocado, fechada como as vizinhas — só o service_role executa.
-- Nenhuma tem dependente gravado (pg_depend, conferido em 18/11): as que as
-- chamam são `language sql`/plpgsql sem corpo atômico, e a chamada por
-- posição resolve para a nova pelo padrão.
--
-- Não depende do código novo: o código de antes não manda `p_tags`, e o nulo
-- é "sem filtro". O código novo só manda `p_tags` quando há tag marcada.

create or replace function public.metrics_tem_as_tags(p_da_pessoa text[], p_tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_tags), 0) = 0
      or not exists (
        select 1 from unnest(p_tags) q(t)
         where btrim(q.t) <> ''
           and not exists (select 1 from unnest(coalesce(p_da_pessoa, '{}'::text[])) x(t)
                            where lower(btrim(x.t)) = lower(btrim(q.t))))
$$;

create or replace function public.metrics_cliente_tem_as_tags(p_client uuid, p_tags text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(cardinality(p_tags), 0) = 0
      or coalesce((select public.metrics_tem_as_tags(c.tags, p_tags) from public.clients c where c.id = p_client), false)
$$;

revoke execute on function public.metrics_tem_as_tags(text[], text[]) from public, anon, authenticated;
revoke execute on function public.metrics_cliente_tem_as_tags(uuid, text[]) from public, anon, authenticated;
grant execute on function public.metrics_tem_as_tags(text[], text[]) to service_role;
grant execute on function public.metrics_cliente_tem_as_tags(uuid, text[]) to service_role;

-- As tags da PESSOA da oportunidade (o Heitor, 18/11: "a tag é da pessoa"): a
-- ficha da cliente ligada; sem cliente, o contato. O ÚNICO lugar que sabe
-- disso — quando as colunas de tag forem unificadas, troca-se só este corpo.
create or replace function public.metrics_tags_da_pessoa_da_oportunidade(p_lead uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select case
           when l.client_id is not null then (select c.tags from public.clients c where c.id = l.client_id)
           else (select ct.tags from public.contacts ct where ct.id = l.contato_id)
         end
    from public.leads l
   where l.id = p_lead
$$;

create or replace function public.metrics_oportunidade_tem_as_tags(p_lead uuid, p_tags text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(cardinality(p_tags), 0) = 0
      or public.metrics_tem_as_tags(public.metrics_tags_da_pessoa_da_oportunidade(p_lead), p_tags)
$$;

revoke execute on function public.metrics_tags_da_pessoa_da_oportunidade(uuid) from public, anon, authenticated;
revoke execute on function public.metrics_oportunidade_tem_as_tags(uuid, text[]) from public, anon, authenticated;
grant execute on function public.metrics_tags_da_pessoa_da_oportunidade(uuid) to service_role;
grant execute on function public.metrics_oportunidade_tem_as_tags(uuid, text[]) to service_role;

-- A assinatura ganha `p_tags` (a cabeça é a do pg_get_functiondef: o último
-- parâmetro, o `)` e a quebra antes do RETURNS); depois, os trechos do corpo.
create or replace function pg_temp.com_tags(p_fn regprocedure, p_cabeca text, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d    text := pg_get_functiondef(p_fn);
  cab  text := p_cabeca || E'\n RETURNS';
  nova text := regexp_replace(p_fn::text, '\)$', ',text[])');
  i int;
  n int;
begin
  n := (length(d) - length(replace(d, cab, ''))) / length(cab);
  if n <> 1 then
    raise exception 'assinatura de %: achada % vez(es), esperado 1', p_fn, n;
  end if;
  d := replace(d, cab, regexp_replace(p_cabeca, '\)$', ', p_tags text[] DEFAULT NULL::text[])') || E'\n RETURNS');
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute format('drop function %s', p_fn);
  execute d;
  execute format('revoke execute on function %s from public, anon, authenticated', nova);
  execute format('grant execute on function %s to service_role', nova);
end
$f$;

-- -- Vendas --------------------------------------------------------------------
-- A lista e o resumo leem `metrics_vendas` (a régua da venda não muda); a tag
-- vale na cliente da venda.

select pg_temp.com_tags(
  'public.metrics_vendas_pagina(uuid,uuid[],timestamptz,timestamptz,text,integer,integer,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[$t$where p_tipo is null or v.tipo = p_tipo$t$],
  array[$t$where (p_tipo is null or v.tipo = p_tipo) and public.metrics_cliente_tem_as_tags(v.cliente_id, p_tags)$t$],
  array[1]);

select pg_temp.com_tags(
  'public.metrics_vendas_resumo(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[$t$from public.metrics_vendas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) x$t$],
  array[$t$from public.metrics_vendas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) x where public.metrics_cliente_tem_as_tags(x.cliente_id, p_tags)$t$],
  array[1]);

-- -- O núcleo (Agenda, Clientes, Profissionais e a ponte das Vendas) ------------

select pg_temp.com_tags(
  'public.metrics_core(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[
    $t$from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) r)$t$,
    $t$where t.type = 'INCOME' and not t.is_paid$t$,
    $t$where m.type = 'EXPENSE'$t$,
    $t$and (p_professional_id is null or a.professional_id = p_professional_id)$t$,
    $t$and (p_professional_id is null or c.professional_id = p_professional_id)$t$,
    $t$where c.tenant_id = p_tenant$t$
  ],
  array[
    $t$from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) r where public.metrics_cliente_tem_as_tags(r.client_id, p_tags))$t$,
    $t$where t.type = 'INCOME' and not t.is_paid and public.metrics_cliente_tem_as_tags(t.client_id, p_tags)$t$,
    $t$where m.type = 'EXPENSE' and public.metrics_cliente_tem_as_tags(m.client_id, p_tags)$t$,
    $t$and (p_professional_id is null or a.professional_id = p_professional_id) and public.metrics_cliente_tem_as_tags(a.client_id, p_tags)$t$,
    $t$and (p_professional_id is null or c.professional_id = p_professional_id) and (coalesce(cardinality(p_tags), 0) = 0 or public.metrics_cliente_tem_as_tags(coalesce((select ca.client_id from public.appointments ca where ca.id = c.appointment_id), (select ct.client_id from public.financial_transactions ct where ct.id = c.transaction_id)), p_tags))$t$,
    $t$where c.tenant_id = p_tenant and public.metrics_tem_as_tags(c.tags, p_tags)$t$
  ],
  array[1, 1, 1, 1, 1, 1]);

-- -- Os agregados das abas -------------------------------------------------------
-- Os agendamentos (`a` e `ax`), a receita dos atendimentos executados, as
-- comissões, a base de clientes e o gasto de cada uma. As partes da Visão
-- geral, do Financeiro e do Estoque não recebem tag da tela.

select pg_temp.com_tags(
  'public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[
    $t$(p_professional_id is null or a.professional_id = p_professional_id)$t$,
    $t$(p_professional_id is null or ax.professional_id = p_professional_id)$t$,
    $t$metrics_receitas_pagas_dos_executados(p_tenant, unidades, p_from, p_to, p_professional_id) t$t$,
    $t$where c.branch_id = any (unidades) and c.released_at between p_from and p_to$t$,
    $t$from public.clients c where c.tenant_id = p_tenant and c.is_active$t$,
    $t$where g.pago is not null$t$
  ],
  array[
    $t$((p_professional_id is null or a.professional_id = p_professional_id) and public.metrics_cliente_tem_as_tags(a.client_id, p_tags))$t$,
    $t$((p_professional_id is null or ax.professional_id = p_professional_id) and public.metrics_cliente_tem_as_tags(ax.client_id, p_tags))$t$,
    $t$metrics_receitas_pagas_dos_executados(p_tenant, unidades, p_from, p_to, p_professional_id) t where (coalesce(cardinality(p_tags), 0) = 0 or public.metrics_cliente_tem_as_tags((select ap.client_id from public.appointments ap where ap.id = t.appointment_id), p_tags))$t$,
    $t$where c.branch_id = any (unidades) and c.released_at between p_from and p_to and (coalesce(cardinality(p_tags), 0) = 0 or public.metrics_cliente_tem_as_tags(coalesce((select ca.client_id from public.appointments ca where ca.id = c.appointment_id), (select ct.client_id from public.financial_transactions ct where ct.id = c.transaction_id)), p_tags))$t$,
    $t$from public.clients c where c.tenant_id = p_tenant and c.is_active and public.metrics_tem_as_tags(c.tags, p_tags)$t$,
    $t$where g.pago is not null and public.metrics_cliente_tem_as_tags(g.client_id, p_tags)$t$
  ],
  array[9, 3, 3, 1, 1, 1]);

-- -- Clientes: a retenção e os novos ao longo do tempo ---------------------------

select pg_temp.com_tags(
  'public.metrics_retention(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[$t$and (p_professional_id is null or a.professional_id = p_professional_id)$t$],
  array[$t$and (p_professional_id is null or a.professional_id = p_professional_id) and public.metrics_cliente_tem_as_tags(a.client_id, p_tags)$t$],
  array[1]);

select pg_temp.com_tags(
  'public.metrics_new_clients_series(uuid,uuid[],timestamptz,timestamptz,text,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[$t$where c.tenant_id = p_tenant$t$],
  array[$t$where c.tenant_id = p_tenant and public.metrics_tem_as_tags(c.tags, p_tags)$t$],
  array[1]);

-- -- O ticket médio (Clientes, Procedimentos) ------------------------------------

select pg_temp.com_tags(
  'public.metrics_ticket_medio(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[$t$where t.client_id is not null$t$],
  array[$t$where t.client_id is not null and public.metrics_cliente_tem_as_tags(t.client_id, p_tags)$t$],
  array[1]);

-- -- Procedimentos e Profissionais: o que ficou fora da receita, e por categoria --

select pg_temp.com_tags(
  'public.metrics_atendimentos_sem_receita(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[$t$and (p_professional_id is null or a.professional_id = p_professional_id)$t$],
  array[$t$and (p_professional_id is null or a.professional_id = p_professional_id) and public.metrics_cliente_tem_as_tags(a.client_id, p_tags)$t$],
  array[1]);

select pg_temp.com_tags(
  'public.metrics_receita_por_categoria_de_procedimento(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[
    $t$metrics_receitas_pagas_dos_executados(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t$t$,
    $t$and (p_professional_id is null or ax.professional_id = p_professional_id)$t$
  ],
  array[
    $t$metrics_receitas_pagas_dos_executados(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t where (coalesce(cardinality(p_tags), 0) = 0 or public.metrics_cliente_tem_as_tags((select ap.client_id from public.appointments ap where ap.id = t.appointment_id), p_tags))$t$,
    $t$and (p_professional_id is null or ax.professional_id = p_professional_id) and public.metrics_cliente_tem_as_tags(ax.client_id, p_tags)$t$
  ],
  array[1, 1]);

-- -- Oportunidades: pelas tags da PESSOA da oportunidade (a cliente; sem ela, o contato) --

select pg_temp.com_tags(
  'public.metrics_comercial(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_owner uuid DEFAULT NULL::uuid)',
  array[
    $t$and (p_owner is null or ld.owner_id is null or ld.owner_id = p_owner)$t$,
    $t$and (p_owner is null or ap.created_by_id = p_owner)$t$
  ],
  array[
    $t$and (p_owner is null or ld.owner_id is null or ld.owner_id = p_owner) and public.metrics_oportunidade_tem_as_tags(ld.id, p_tags)$t$,
    $t$and (p_owner is null or ap.created_by_id = p_owner) and public.metrics_cliente_tem_as_tags(ap.client_id, p_tags)$t$
  ],
  array[1, 1]);

select pg_temp.com_tags(
  'public.metrics_lead_funnel(uuid,uuid[],timestamptz,timestamptz,uuid,uuid)'::regprocedure,
  'p_owner uuid DEFAULT NULL::uuid)',
  array[$t$and (p_owner is null or l.owner_id is null or l.owner_id = p_owner)$t$],
  array[$t$and (p_owner is null or l.owner_id is null or l.owner_id = p_owner) and public.metrics_oportunidade_tem_as_tags(l.id, p_tags)$t$],
  array[1]);

select pg_temp.com_tags(
  'public.metrics_conversao_por_origem(uuid,timestamptz,timestamptz,uuid)'::regprocedure,
  'p_owner uuid DEFAULT NULL::uuid)',
  array[$t$and (p_owner is null or ld.owner_id is null or ld.owner_id = p_owner)$t$],
  array[$t$and (p_owner is null or ld.owner_id is null or ld.owner_id = p_owner) and public.metrics_oportunidade_tem_as_tags(ld.id, p_tags)$t$],
  array[1]);

select pg_temp.com_tags(
  'public.metrics_motivos_de_perda(uuid,timestamptz,timestamptz,uuid)'::regprocedure,
  'p_owner uuid DEFAULT NULL::uuid)',
  array[$t$and (p_owner is null or l.owner_id is null or l.owner_id = p_owner)$t$],
  array[$t$and (p_owner is null or l.owner_id is null or l.owner_id = p_owner) and public.metrics_oportunidade_tem_as_tags(l.id, p_tags)$t$],
  array[1]);

notify pgrst, 'reload schema';
