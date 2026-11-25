/**
 * O que o REGISTRO não guarda, nas gravações do Copilot (o Heitor, 25/11: "Se
 * não for impossível, ainda que improvável, pode ser feito."). O Copilot
 * recusa o MESMO que a tela do mesmo gesto — nem mais, nem menos: os tetos que
 * só ele tinha (lançar até R$ 10.000.000, a entrada até 100.000 embalagens…)
 * saíram, e sobra o impossível, que é o tipo da coluna no banco (decisão do
 * Claude, 25/11).
 *
 * Uma regra só: os limites moram no núcleo — o dinheiro em
 * `lib/financeiro/limites-do-registro.ts`, o estoque em
 * `lib/estoque/limites-do-registro.ts`, o valor da oportunidade em
 * `lib/crm/valor-do-card.ts` —, que a action da tela confere no servidor. O
 * Copilot lê os mesmos daqui. Puro.
 */
export { LIMITE_DO_DINHEIRO, RECUSA_DO_DINHEIRO } from '@/lib/financeiro/limites-do-registro'
export { LIMITE_DO_ESTOQUE, RECUSA_DA_QUANTIDADE_DO_ESTOQUE, recusaDoEstoqueAcimaDoRegistro } from '@/lib/estoque/limites-do-registro'
export { LIMITE_DO_VALOR_DA_OPORTUNIDADE, RECUSA_DO_VALOR_DA_OPORTUNIDADE } from '@/lib/crm/valor-do-card'
