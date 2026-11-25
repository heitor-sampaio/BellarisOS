-- O filtro de Tags na Visão geral e na aba Financeiro dos Relatórios.
--
-- Q05 do catálogo dos Indicadores, resolvida na revisão de 24/11: "A sua regra
-- das Tags ('onde tiver for passível de filtro, um dos filtros que ela pode
-- usar são as tags') já decide: a Visão geral e a aba Financeiro dos
-- Relatórios têm filtros, então ganham o de Tags. Defeito a corrigir." Até
-- aqui (20261125100002) as duas abas não tinham o filtro, por decisão do
-- Claude ("o lucro filtrado por tag não é de ninguém").
--
-- A régua é a das outras abas (TF-02, `docs/regras/indicadores.md`): a linha
-- entra se a cliente dela tem TODAS as tags marcadas; a linha sem cliente (a
-- despesa, a compra de estoque, o fechamento das comissões) sai enquanto
-- houver tag. O `metrics_core` já fazia isso com a despesa e a receita; aqui
-- ganham a tag as contas que faltavam nas duas abas, para o lucro, a margem, o
-- DRE e o gráfico de evolução serem das MESMAS linhas que os cartões
-- (princípio 3):
-- - `metrics_series` (o gráfico de evolução: a receita e a despesa pagas);
-- - `metrics_resultado` e `metrics_series_do_resultado` (a compra de estoque —
--   sem cliente, sai —, o insumo consumido, pela cliente do atendimento, e o
--   custo do produto vendido, pela cliente da venda);
-- - `metrics_custos_da_venda` e `metrics_series_dos_custos_da_venda` (a taxa
--   da maquininha, pela cliente do recebimento; a comissão, pela cliente do
--   atendimento ou do lançamento, como no `metrics_core`; a despesa do
--   fechamento das comissões, sem cliente, sai);
-- - no `metrics_relatorio`, a receita por unidade (o período e o anterior),
--   por forma de pagamento e por categoria.
--
-- Troca de texto sobre o corpo VIVO de cada função (lido na produção em 24/11):
-- cada trecho tem de aparecer o número de vezes esperado, ou a migration para.
-- As cinco primeiras mudam de assinatura (`p_tags text[] default null` no
-- fim; as chamadas de antes, por nome ou por posição, seguem iguais): a velha
-- sai e a nova nasce do corpo trocado, só com o service_role, como as
-- vizinhas. O `metrics_relatorio` já tem `p_tags`: só o corpo muda.
-- Sem tag marcada, nada muda (as réguas dizem "sim").

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

-- -- O gráfico de evolução ---------------------------------------------------

select pg_temp.com_tags(
  'public.metrics_series(uuid,uuid[],timestamptz,timestamptz,text,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[$t$where not (t.type = 'INCOME' and t.payment_method is not distinct from 'INTERNAL_CREDIT')$t$],
  array[$t$where not (t.type = 'INCOME' and t.payment_method is not distinct from 'INTERNAL_CREDIT') and public.metrics_cliente_tem_as_tags(t.client_id, p_tags)$t$],
  array[1]);

-- -- O estoque no resultado (o total, cada unidade e cada fatia) ---------------

select pg_temp.com_tags(
  'public.metrics_resultado(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[
    $t$where t.type = 'EXPENSE'$t$,
    $t$where m.type = 'PROCEDURE_USAGE'$t$,
    $t$and v.estornada_em is null$t$
  ],
  array[
    $t$where t.type = 'EXPENSE' and public.metrics_cliente_tem_as_tags(t.client_id, p_tags)$t$,
    $t$where m.type = 'PROCEDURE_USAGE' and (coalesce(cardinality(p_tags), 0) = 0 or public.metrics_cliente_tem_as_tags((select ap.client_id from public.appointments ap where ap.id = m.appointment_id), p_tags))$t$,
    $t$and v.estornada_em is null and public.metrics_cliente_tem_as_tags(v.client_id, p_tags)$t$
  ],
  array[1, 1, 1]);

select pg_temp.com_tags(
  'public.metrics_series_do_resultado(uuid,uuid[],timestamptz,timestamptz,text,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[
    $t$where t.type = 'EXPENSE'$t$,
    $t$where m.type = 'PROCEDURE_USAGE'$t$,
    $t$and v.estornada_em is null$t$
  ],
  array[
    $t$where t.type = 'EXPENSE' and public.metrics_cliente_tem_as_tags(t.client_id, p_tags)$t$,
    $t$where m.type = 'PROCEDURE_USAGE' and (coalesce(cardinality(p_tags), 0) = 0 or public.metrics_cliente_tem_as_tags((select ap.client_id from public.appointments ap where ap.id = m.appointment_id), p_tags))$t$,
    $t$and v.estornada_em is null and public.metrics_cliente_tem_as_tags(v.client_id, p_tags)$t$
  ],
  array[1, 1, 1]);

-- -- A taxa da maquininha e as comissões (o total, cada unidade e cada fatia) ---

select pg_temp.com_tags(
  'public.metrics_custos_da_venda(uuid,uuid[],timestamptz,timestamptz,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[
    $t$where r.amount <> 0$t$,
    $t$and (p_professional_id is null or c.professional_id = p_professional_id)$t$,
    $t$and p_professional_id is null$t$
  ],
  array[
    $t$where r.amount <> 0 and public.metrics_cliente_tem_as_tags(r.client_id, p_tags)$t$,
    $t$and (p_professional_id is null or c.professional_id = p_professional_id) and (coalesce(cardinality(p_tags), 0) = 0 or public.metrics_cliente_tem_as_tags(coalesce((select ca.client_id from public.appointments ca where ca.id = c.appointment_id), (select ct.client_id from public.financial_transactions ct where ct.id = c.transaction_id)), p_tags))$t$,
    $t$and p_professional_id is null and public.metrics_cliente_tem_as_tags(t.client_id, p_tags)$t$
  ],
  array[1, 1, 1]);

select pg_temp.com_tags(
  'public.metrics_series_dos_custos_da_venda(uuid,uuid[],timestamptz,timestamptz,text,uuid)'::regprocedure,
  'p_professional_id uuid DEFAULT NULL::uuid)',
  array[
    $t$where r.amount <> 0$t$,
    $t$and (p_professional_id is null or c.professional_id = p_professional_id)$t$,
    $t$and p_professional_id is null$t$
  ],
  array[
    $t$where r.amount <> 0 and public.metrics_cliente_tem_as_tags(r.client_id, p_tags)$t$,
    $t$and (p_professional_id is null or c.professional_id = p_professional_id) and (coalesce(cardinality(p_tags), 0) = 0 or public.metrics_cliente_tem_as_tags(coalesce((select ca.client_id from public.appointments ca where ca.id = c.appointment_id), (select ct.client_id from public.financial_transactions ct where ct.id = c.transaction_id)), p_tags))$t$,
    $t$and p_professional_id is null and public.metrics_cliente_tem_as_tags(t.client_id, p_tags)$t$
  ],
  array[1, 1, 1]);

-- -- A receita por unidade, por forma e por categoria -------------------------

select pg_temp.trocar_no_corpo(
  'public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid,text[])'::regprocedure,
  array[
    $t$from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) group by branch_id) a$t$,
    $t$from public.metrics_receitas_pagas(p_tenant, unidades, p_prev_from, p_prev_to, p_professional_id) group by branch_id) p$t$,
    $t$where payment_method is not null group by payment_method$t$,
    $t$where category is not null group by category$t$
  ],
  array[
    $t$from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) where public.metrics_cliente_tem_as_tags(client_id, p_tags) group by branch_id) a$t$,
    $t$from public.metrics_receitas_pagas(p_tenant, unidades, p_prev_from, p_prev_to, p_professional_id) where public.metrics_cliente_tem_as_tags(client_id, p_tags) group by branch_id) p$t$,
    $t$where payment_method is not null and public.metrics_cliente_tem_as_tags(client_id, p_tags) group by payment_method$t$,
    $t$where category is not null and public.metrics_cliente_tem_as_tags(client_id, p_tags) group by category$t$
  ],
  array[1, 1, 1, 1]);

notify pgrst, 'reload schema';
