-- O complemento do item 10 da auditoria das regras (2026-11-18; a migration
-- `20261124000201`): a escolha da rede sobre os pontos ("Sobre o valor pago",
-- `commission_configs.base_com_pontos = 'VALOR_PAGO'`) vale em toda comissão
-- — também na venda do pacote, do plano, do pré-pago e do produto
-- (docs/regras/comissoes.md, "A escolha da rede vale em toda comissão").
--
-- A conta (`private.comissao_conta_detalhe`) já tira os pontos da base quando o
-- RETRATO da linha diz `VALOR_PAGO`. Mas as funções de venda gravavam o retrato
-- com o texto fixo 'PRECO' — a linha da venda nunca dizia a escolha da rede, e
-- a conta nunca tirava os pontos dela. Prova: `e2e/comissoes-pontos-na-base-das-vendas.spec.ts`
-- (na completa de 18/11: "a linha retrata a escolha da rede", esperado
-- VALOR_PAGO, recebido PRECO).
--
-- Aqui: o retrato da linha de venda passa a ser o da configuração da rede no
-- momento da venda (sem configuração, 'PRECO', o padrão), como já faziam a
-- conclusão do atendimento e a sessão do pacote. Troca de texto sobre o corpo
-- VIVO de cada função; o trecho tem de aparecer o número de vezes esperado, ou
-- a migration para. As linhas que já existem não mudam (o passado não muda de
-- valor).

create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
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
end
$f$;

-- O pacote, com quem vendeu e a responsável: as três linhas da venda.
select pg_temp.trocar_no_corpo(
  'public.pacote_vender_com_equipe(uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,numeric)'::regprocedure,
  array[$t$'PRECO', v_vendido, 0, v_cp,$t$],
  array[$t$coalesce(v_cfg.base_com_pontos, 'PRECO'), v_vendido, 0, v_cp,$t$],
  array[3]);

-- O pacote pelo caminho antigo.
select pg_temp.trocar_no_corpo(
  'public.pacote_vender(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,numeric)'::regprocedure,
  array[$t$'PRECO', v_vendido, 0, v_cp);$t$],
  array[$t$coalesce(v_cfg.base_com_pontos, 'PRECO'), v_vendido, 0, v_cp);$t$],
  array[1]);

-- A venda do plano: a linha nova e a refeita (que já refaz a taxa).
select pg_temp.trocar_no_corpo(
  'public.plano_comissao_de_venda(uuid,uuid,uuid)'::regprocedure,
  array[
    $t$'PRECO', round(v_vendido, 2), 0, v_de)$t$,
    $t$desconta_taxa = coalesce(v_cfg.desconta_taxa, false), regra_de = v_de$t$
  ],
  array[
    $t$coalesce(v_cfg.base_com_pontos, 'PRECO'), round(v_vendido, 2), 0, v_de)$t$,
    $t$desconta_taxa = coalesce(v_cfg.desconta_taxa, false), regra_de = v_de,
           base_com_pontos = coalesce(v_cfg.base_com_pontos, 'PRECO')$t$
  ],
  array[1, 1]);

-- O pré-pago (não carrega a configuração inteira: lê a escolha ali).
select pg_temp.trocar_no_corpo(
  'public.procedimento_vender_com_equipe(uuid,uuid,uuid,uuid,uuid,uuid,integer,numeric,integer,jsonb,jsonb)'::regprocedure,
  array[$t$'PRECO', v_vendido, 0, v_venda, 'PESSOA');$t$],
  array[$t$coalesce((select c.base_com_pontos from public.commission_configs c where c.tenant_id = p_tenant), 'PRECO'),
            v_vendido, 0, v_venda, 'PESSOA');$t$],
  array[1]);

-- O produto, pelo caminho antigo e pela venda de vários itens.
select pg_temp.trocar_no_corpo(
  'public.produto_vender(uuid,uuid,uuid,uuid,uuid,integer,numeric,jsonb)'::regprocedure,
  array[$t$'PRECO', v_vendido, 0, v_venda);$t$],
  array[$t$coalesce(v_cfg.base_com_pontos, 'PRECO'), v_vendido, 0, v_venda);$t$],
  array[1]);

select pg_temp.trocar_no_corpo(
  'public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)'::regprocedure,
  array[$t$coalesce(v_cfg.desconta_taxa, false), 'PRECO'$t$],
  array[$t$coalesce(v_cfg.desconta_taxa, false), coalesce(v_cfg.base_com_pontos, 'PRECO')$t$],
  array[2]);

notify pgrst, 'reload schema';
