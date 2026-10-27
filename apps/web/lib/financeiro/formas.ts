/**
 * O nome de cada forma de pagamento — UM (A33 e A35 da simulação de
 * 2026-10-27). Cada tela tinha a sua tabela, e nenhuma dizia o "3x" do cartão
 * de crédito, que está no lançamento (`cartao_vezes`, pago na hora — §9.6).
 * Puro: serve ao servidor e ao navegador.
 */

const CURTO: Record<string, string> = {
  CASH: 'Dinheiro', PIX: 'Pix', DEBIT_CARD: 'Débito', CREDIT_CARD: 'Crédito', INTERNAL_CREDIT: 'Crédito interno',
}
const LONGO: Record<string, string> = {
  CASH: 'Dinheiro', PIX: 'Pix', DEBIT_CARD: 'Cartão de débito', CREDIT_CARD: 'Cartão de crédito', INTERNAL_CREDIT: 'Crédito interno',
}

/** "Crédito 3x", "Pix"… — `longo` para "Cartão de crédito 3x". Sem forma: "Sem forma de pagamento". */
export function rotuloDaForma(metodo: string | null | undefined, vezes?: number | null, opcoes: { longo?: boolean } = {}): string {
  if (!metodo) return 'Sem forma de pagamento'
  const nome = (opcoes.longo ? LONGO : CURTO)[metodo] ?? metodo
  return metodo === 'CREDIT_CARD' && vezes && vezes > 1 ? `${nome} ${vezes}x` : nome
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
 * tela, de `private.comissao_taxa_pct`: a das vezes exatas; sem ela, a da
 * maior parcela cadastrada até N; sem nenhuma, zero. `cadastrada` diz se a
 * das vezes exatas existe (o aviso do A33).
 */
export function taxaQueVale(taxas: { parcelas: number; taxa_pct: number }[], vezes: number): {
  cadastrada: boolean; parcelas: number | null; taxa: number
} {
  const exata = taxas.find(t => t.parcelas === vezes)
  if (exata) return { cadastrada: true, parcelas: vezes, taxa: Number(exata.taxa_pct) }
  const abaixo = taxas.filter(t => t.parcelas <= vezes).sort((a, b) => b.parcelas - a.parcelas)[0]
  return abaixo
    ? { cadastrada: false, parcelas: abaixo.parcelas, taxa: Number(abaixo.taxa_pct) }
    : { cadastrada: false, parcelas: null, taxa: 0 }
}
