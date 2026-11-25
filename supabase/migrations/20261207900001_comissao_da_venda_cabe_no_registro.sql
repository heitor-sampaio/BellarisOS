-- A comissão de uma venda grande cabe no registro.
--
-- O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
-- feito." A venda de produto e a comanda deixaram de recusar acima de 100
-- unidades (20261207200001). A comissão em R$ fixo do produto vale POR UNIDADE,
-- e a venda grava a regra vezes a quantidade (`produto_vender_itens`:
-- `round(comissao_valor * quantity, 2)` em `commissions.rule_value`, numeric(10,4),
-- e o valor em `commissions.amount`, numeric(10,2)). R$ 10 por unidade em
-- 100.001 unidades já não cabia, e o banco recusava a VENDA ("numeric field
-- overflow") por causa da coluna da comissão.
--
-- Decisão do Claude, 25/11 (princípio 2): cada valor que a rede escolheu cabe
-- no registro — o que estourava é o total DERIVADO. As colunas do derivado
-- crescem, com as mesmas casas: o arredondamento implícito da gravação segue
-- o mesmo (4 casas na regra, 2 no valor). numeric(20,4) cobre o maior total
-- possível (R$ 999.999,99 por unidade × 2.147.483.647 unidades).
-- `commission_rules.value` (o que a rede digita, por unidade) não muda: o
-- limite dele é o da tela (`LIMITE_DA_COMISSAO_FIXA`, lib/comissoes/config.ts).
--
-- Nenhuma view depende das duas colunas, e nenhuma função declara variável
-- com o tamanho antigo (conferido na produção em 25/11). ADITIVA: só alarga;
-- nenhum valor gravado muda.

alter table public.commissions
  alter column rule_value type numeric(20,4),
  alter column amount type numeric(20,2);

notify pgrst, 'reload schema';
