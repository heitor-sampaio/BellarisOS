/**
 * O nome de cada forma de pagamento — UM (A33 e A35 da simulação de
 * 2026-10-27). Cada tela tinha a sua tabela, e nenhuma dizia o "3x" do cartão
 * de crédito, que está no lançamento (`cartao_vezes`, pago na hora — §9.6).
 * Puro: serve ao servidor e ao navegador.
 */

// PDV8 (o Heitor, 13/11: "o crediario é uma forma de pagamento"): CREDIARIO
// é a venda no crediário — não é meio de lançamento (as parcelas nascem sem
// meio, D6); é o nome da forma na comanda (`pdv_comandas`) e no bloco do PDV.
const CURTO: Record<string, string> = {
  CASH: 'Dinheiro', PIX: 'Pix', DEBIT_CARD: 'Débito', CREDIT_CARD: 'Crédito', INTERNAL_CREDIT: 'Crédito interno', BOLETO: 'Boleto',
  CREDIARIO: 'Crediário', A_RECEBER: 'A receber',
}
const LONGO: Record<string, string> = {
  CASH: 'Dinheiro', PIX: 'Pix', DEBIT_CARD: 'Cartão de débito', CREDIT_CARD: 'Cartão de crédito', INTERNAL_CREDIT: 'Crédito interno', BOLETO: 'Boleto',
  CREDIARIO: 'Crediário', A_RECEBER: 'A receber',
}

/**
 * As formas de pagar uma DESPESA (A14 da 9ª simulação: faltava o Boleto, e a
 * luz e o aluguel ficavam "Não informado"). O Boleto é só da despesa: a
 * cliente não paga a recepção por boleto.
 */
export const FORMAS_DA_DESPESA = ['PIX', 'BOLETO', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const

/**
 * "Crédito 3x", "Pix"… — `longo` para "Cartão de crédito 3x". Sem forma: "Sem
 * forma de pagamento". Com a `bandeira` do cartão, ela vai no nome — "Crédito
 * Visa 5x" (A39 da 6ª simulação: o recibo, a confirmação e o app não diziam).
 * Com a `maquininha` (o NOME), ela vai no fim — "Débito Visa · Stone" (A18 da
 * 14ª, F75: quem estornava não sabia de qual maquininha). Quem chama só passa
 * o nome quando a rede tem MAIS DE UMA (`maquininhaDoRotulo`); com uma, nada.
 */
export function rotuloDaForma(
  metodo: string | null | undefined, vezes?: number | null, opcoes: { longo?: boolean; bandeira?: string | null; maquininha?: string | null } = {},
): string {
  if (!metodo) return 'Sem forma de pagamento'
  const nome = (opcoes.longo ? LONGO : CURTO)[metodo] ?? metodo
  const noCartao = metodo === 'CREDIT_CARD' || metodo === 'DEBIT_CARD'
  const daBandeira = noCartao && opcoes.bandeira
    ? ` ${BANDEIRA[opcoes.bandeira] ?? opcoes.bandeira}` : ''
  const daMaquininha = noCartao && opcoes.maquininha ? ` · ${opcoes.maquininha}` : ''
  return (metodo === 'CREDIT_CARD' && vezes && vezes > 1 ? `${nome}${daBandeira} ${vezes}x` : `${nome}${daBandeira}`) + daMaquininha
}

/**
 * O nome da maquininha que vai no rótulo do pagamento (A18 da 14ª): só quando
 * a rede tem mais de uma (com uma só, o nome não diz nada — princípio 7).
 * `nomes` vem de `nomesDasMaquininhas` (o servidor); nulo = uma só ou nenhuma.
 */
export function maquininhaDoRotulo(nomes: Record<string, string> | null | undefined, id: string | null | undefined): string | null {
  if (!nomes || !id || Object.keys(nomes).length < 2) return null
  return nomes[id] ?? null
}

/** O nome de cada bandeira (o espelho de BANDEIRAS, lib/financeiro/bandeiras — aqui sem zod, para o navegador e o banco). */
const BANDEIRA: Record<string, string> = {
  VISA: 'Visa', MASTERCARD: 'Mastercard', ELO: 'Elo', AMEX: 'Amex', HIPERCARD: 'Hipercard', OUTRAS: 'Outras',
}

/** "Visa" — ou "Bandeira não informada" (A44 da 12ª: o Fechamento e o CSV por bandeira). */
export function nomeDaBandeira(bandeira: string | null | undefined): string {
  return bandeira ? BANDEIRA[bandeira] ?? bandeira : 'Bandeira não informada'
}

/**
 * A linha do Fechamento do dia (`metrics_fechamento_do_dia`): a chave é a
 * forma, com as vezes do crédito (`CREDIT_CARD:3`). Sem forma, o que os
 * PONTOS pagaram é "(pontos)"; o resto — a compra de estoque, a despesa
 * lançada sem meio — é "Sem forma de pagamento" (A35).
 */
export function rotuloDaFormaDoFechamento(chave: string): string {
  if (chave === 'PONTOS') return 'Sem forma (pontos)'
  if (chave === 'SEM_FORMA') return 'Sem forma de pagamento'
  const [metodo, vezes] = chave.split(':')
  return rotuloDaForma(metodo, vezes ? Number(vezes) : null, { longo: true })
}

/**
 * A taxa da maquininha que vale para o crédito em N vezes — o espelho, para a
 * tela, de `private.comissao_taxa_pct`: a das vezes EXATAS; sem ela, zero —
 * nunca a de outras vezes (F16-2, o Heitor, 2026-11-03: o fallback "pode
 * levar a erros de cálculos"). `cadastrada` diz se ela existe (o aviso do A33).
 */
export function taxaQueVale(taxas: { parcelas: number; taxa_pct: number }[], vezes: number): {
  cadastrada: boolean; parcelas: number | null; taxa: number
} {
  const exata = taxas.find(t => t.parcelas === vezes)
  if (exata) return { cadastrada: true, parcelas: vezes, taxa: Number(exata.taxa_pct) }
  return { cadastrada: false, parcelas: null, taxa: 0 }
}

/**
 * A forma de um lançamento numa lista da cliente (a ficha, o app): o que tem
 * meio, pelo nome; a PARCELA do crediário sem meio, "Com a clínica" — D6 da 6ª
 * simulação: o saldo que a cliente paga à clínica não é cartão, e o meio se
 * escolhe ao receber. O resto sem forma (o pago só com pontos), nada.
 */
export function formaDoLancamento(l: {
  metodo: string | null | undefined; vezes?: number | null; bandeira?: string | null; pago: boolean; parcela?: number | null
}): string | null {
  if (l.metodo) return rotuloDaForma(l.metodo, l.vezes, { bandeira: l.bandeira })
  if (!l.pago && l.parcela) return 'Com a clínica'
  return null
}
