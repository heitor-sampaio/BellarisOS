-- O filtro de Tags em Financeiro → Comissões e na tela Documentos.
--
-- Q04 do catálogo das Comissões (revisão de 24/11): "a aba Comissões tem
-- filtro, então ganha o de Tags (a tag da cliente da comissão). Defeito a
-- corrigir." DT-01 do catálogo dos Documentos: cada documento é de uma
-- cliente, e a tela tinha os filtros fixos sem o de Tags (CLAUDE.md §1, o
-- Heitor, 13/11: "onde tiver for passível de filtro, um dos filtros que ela
-- pode usar são as tags").
--
-- A régua é a dos Relatórios (TF-02): entra a linha cuja cliente tem TODAS as
-- tags marcadas; sem tag marcada, nada muda (a régua diz "sim").
-- - A cliente da comissão mora num lugar só, `public.cliente_da_comissao`: a
--   do atendimento (o da comissão ou o da linha), a do lançamento e, sem os
--   dois, a da venda da linha (produto, pacote, plano, pré-pago) — a mesma
--   ordem do nome que o extrato mostra.
-- - `comissoes_resumo`: o liberado, o a pagar e o aguardando contam só as
--   comissões das clientes marcadas; o pago, só a parte dessas clientes em
--   cada fechamento (o fechamento é da pessoa inteira).
-- - `comissoes_extrato_com_regra`: só as linhas dessas clientes.
-- - `documentos_emitidos_pagina` e `documentos_emitidos_resumo`: só os
--   documentos dessas clientes (a lista, o total e os números do topo).
--
-- Corpo VIVO de cada função (lido na produção em 24/11): cada trecho tem de
-- aparecer o número de vezes esperado, ou a migration para. As quatro mudam
-- de assinatura (`p_tags text[] default null` no fim; as chamadas de antes
-- seguem iguais): a velha sai e a nova nasce só com o service_role.

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

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end $f$;

-- -- A cliente da comissão --------------------------------------------------

create or replace function public.cliente_da_comissao(p_line uuid, p_appointment uuid, p_transaction uuid)
returns uuid language sql stable set search_path = '' as $$
  select coalesce(
    (select a.client_id from public.appointments a
      where a.id = coalesce(p_appointment, (select l.appointment_id from public.commission_lines l where l.id = p_line))),
    (select t.client_id from public.financial_transactions t where t.id = p_transaction),
    (select coalesce(ps.client_id, cp.client_id, tp.client_id, psv.client_id)
       from public.commission_lines l
       left join public.product_sales ps    on ps.id  = l.product_sale_id
       left join public.client_packages cp  on cp.id  = l.client_package_id
       left join public.treatment_plans tp  on tp.id  = l.treatment_plan_id
       left join public.procedure_sales psv on psv.id = l.procedure_sale_id
      where l.id = p_line))
$$;

create or replace function public.comissao_tem_as_tags(p_line uuid, p_appointment uuid, p_transaction uuid, p_tags text[])
returns boolean language sql stable set search_path = '' as $$
  select coalesce(cardinality(p_tags), 0) = 0
      or public.metrics_cliente_tem_as_tags(public.cliente_da_comissao(p_line, p_appointment, p_transaction), p_tags)
$$;

revoke execute on function public.cliente_da_comissao(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cliente_da_comissao(uuid, uuid, uuid) to service_role;
revoke execute on function public.comissao_tem_as_tags(uuid, uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.comissao_tem_as_tags(uuid, uuid, uuid, text[]) to service_role;

-- -- As comissões -----------------------------------------------------------

select pg_temp.com_tags(
  'public.comissoes_resumo(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_profissional uuid)',
  array[
    $t$where (p_profissional is null or c.professional_id = p_profissional)$t$,
    $t$sum(p.total) pago$t$,
    $t$join escopo e on e.id = g.branch_id$t$
  ],
  array[
    $t$where (p_profissional is null or c.professional_id = p_profissional)
       and public.comissao_tem_as_tags(c.line_id, c.appointment_id, c.transaction_id, p_tags)$t$,
    $t$sum(case when coalesce(cardinality(p_tags), 0) = 0 then p.total
                else (select coalesce(sum(cc.amount), 0) from public.commissions cc
                       where cc.payout_id = p.id
                         and public.comissao_tem_as_tags(cc.line_id, cc.appointment_id, cc.transaction_id, p_tags)) end) pago$t$,
    $t$join escopo e on e.id = g.branch_id
     where public.comissao_tem_as_tags(g.line_id, null, null, p_tags)$t$
  ],
  array[1, 1, 1]);

select pg_temp.com_tags(
  'public.comissoes_extrato_com_regra(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_profissional uuid)',
  array[$t$   order by x.released_at desc, x.id$t$],
  array[$t$   where public.comissao_tem_as_tags(x.line_id, x.appointment_id, x.transaction_id, p_tags)
   order by x.released_at desc, x.id$t$],
  array[1]);

-- -- Os documentos ----------------------------------------------------------

select pg_temp.com_tags(
  'public.documentos_emitidos_pagina(uuid,uuid[],timestamptz,timestamptz,uuid,text,text,text,integer,integer)'::regprocedure,
  'p_offset integer DEFAULT 0)',
  array[$t$and (p_tipo is null or v.tipo = p_tipo)$t$],
  array[$t$and (p_tipo is null or v.tipo = p_tipo)
     and public.metrics_cliente_tem_as_tags(v.cliente_id, p_tags)$t$],
  array[1]);

select pg_temp.com_tags(
  'public.documentos_emitidos_resumo(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_professional_id uuid)',
  array[
    $t$where p_professional_id is null or exists ($t$,
    $t$and ap.status <> 'CANCELLED')$t$
  ],
  array[
    $t$where public.metrics_cliente_tem_as_tags(v.cliente_id, p_tags) and (p_professional_id is null or exists ($t$,
    $t$and ap.status <> 'CANCELLED'))$t$
  ],
  array[1, 1]);

notify pgrst, 'reload schema';
