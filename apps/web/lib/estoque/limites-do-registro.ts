import { LIMITE_DO_DINHEIRO, RECUSA_DO_DINHEIRO, passaDoRegistro } from '@/lib/financeiro/limites-do-registro'

/**
 * O que o REGISTRO do estoque guarda (o Heitor, 25/11: "Se não for impossível,
 * ainda que improvável, pode ser feito."). O impossível é o tipo da coluna
 * (decisão do Claude, 25/11), conferido no SERVIDOR — nos núcleos que a tela
 * e o Copilot dividem (CLAUDE.md §4, o Heitor, 19/11: "Qualquer gravação que
 * não passa pela validação do backend ta errada"). Até aqui só o Copilot
 * conferia (morava em `lib/copilot/ferramentas/limites-do-registro.ts`, que
 * agora lê daqui), e a tela ouvia do banco "numeric field overflow".
 *
 * numeric(10,4): a quantidade e o saldo do movimento
 * (`stock_movements.quantity` e `balance_after`) e do lote
 * (`product_batches.quantity`, `stock_movement_batches.quantity`). O
 * movimento e o saldo vão na unidade de CONSUMO quando o produto tem uma (o
 * frasco de 100 UI); o lote, em embalagens. Puro.
 */
export const LIMITE_DO_ESTOQUE = 999_999.9999

const quatroCasas = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
/** O maior número de 4 casas que, vezes o fator, ainda cabe (sem arredondar para cima). */
const cabeEm = (fator: number) => Math.floor(LIMITE_DO_ESTOQUE / fator * 10_000) / 10_000
const passa = (n: number) => passaDoRegistro(n, LIMITE_DO_ESTOQUE, 4)

export const RECUSA_DA_QUANTIDADE_DO_ESTOQUE = (medida = 'embalagens') => `No máximo ${quatroCasas(LIMITE_DO_ESTOQUE)} ${medida} (o limite do registro).`

/**
 * A quantidade da entrada ou a contagem do ajuste que o registro não guarda:
 * - a quantidade em embalagens (o lote) acima do limite;
 * - a quantidade vezes o fator (o movimento, na unidade de consumo) acima dele;
 * - o saldo DEPOIS (na unidade do movimento) acima dele.
 * `medida` é a embalagem já no plural; `consumo`, a unidade de consumo (com fator > 1).
 */
export function recusaDoEstoqueAcimaDoRegistro(a: {
  quantidade: number; fator: number; saldoDepois?: number | null; medida: string; consumo?: string | null
}): string | null {
  const fator = a.fator > 0 ? a.fator : 1
  if (passa(a.quantidade)) return RECUSA_DA_QUANTIDADE_DO_ESTOQUE(a.medida)
  if (fator !== 1 && passa(a.quantidade * fator)) {
    return `No máximo ${quatroCasas(cabeEm(fator))} ${a.medida} de uma vez (${quatroCasas(LIMITE_DO_ESTOQUE)} ${a.consumo ?? 'na unidade de consumo'}, o limite do registro).`
  }
  if (a.saldoDepois != null && passa(a.saldoDepois)) {
    return `O saldo passaria de ${quatroCasas(LIMITE_DO_ESTOQUE)} ${fator !== 1 && a.consumo ? a.consumo : a.medida} (o limite do registro).`
  }
  return null
}

/**
 * A SAÍDA da baixa (o insumo do atendimento), na unidade do movimento: a
 * quantidade digitada e o saldo depois — que fica negativo quando falta
 * (faltar não impede, `lib/estoque/baixa.ts`), e o registro também tem fundo.
 */
export function recusaDaBaixaAcimaDoRegistro(a: { quantidade: number; saldoDepois: number; medida: string }): string | null {
  if (passa(a.quantidade)) return `No máximo ${quatroCasas(LIMITE_DO_ESTOQUE)} ${a.medida} de uma vez (o limite do registro).`
  if (passa(a.saldoDepois)) return `O saldo passaria de ${a.saldoDepois < 0 ? '−' : ''}${quatroCasas(LIMITE_DO_ESTOQUE)} ${a.medida} (o limite do registro).`
  return null
}

/**
 * O custo unitário da entrada (e do cadastro do produto, que a entrada
 * atualiza): o zero vale, como a janela; o negativo é impossível; e o
 * registro (`products.cost_price`, numeric(10,2)).
 */
export function recusaDoCustoDaEntrada(custo: number | null | undefined): string | null {
  if (custo == null || !Number.isFinite(custo)) return null
  if (custo < 0) return 'O custo unitário não pode ser negativo.'
  return passaDoRegistro(custo, LIMITE_DO_DINHEIRO, 2) ? RECUSA_DO_DINHEIRO : null
}
