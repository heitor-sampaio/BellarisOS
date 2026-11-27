import { taxaNaMaquininha, type Maquininha } from '@/lib/financeiro/maquininhas'
import { ehBandeira } from '@/lib/financeiro/bandeiras'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'

/**
 * A1 da 38ª simulação (princípio 4: "Faltou o dado, vale zero e a tela
 * avisa"; CT-02: sem a taxa daquelas vezes, sai 0%). O crédito 8x sem taxa
 * cadastrada valeu 0% na base da comissão; a janela de receber avisou, e o
 * extrato dizia só "base sem a taxa da maquininha". Aqui se decide se a linha
 * diz a forma sem taxa: a rede desconta a taxa desta linha, a regra é em
 * percentual (no fixo a taxa não sai, CB-03), nada saiu de taxa, e o pagamento
 * da linha foi no cartão numa maquininha sem a taxa daquelas vezes (a conta de
 * `taxaNaMaquininha`, o espelho de `private.taxa_da_maquininha`). Sem a
 * maquininha do pagamento, nada — não se chuta. Puro.
 */
export interface PagamentoDaLinha {
  payment_method: string | null
  cartao_vezes: number | null
  cartao_bandeira: string | null
  maquininha_id: string | null
}

export function formaSemTaxaCadastrada(
  l: Pick<LancamentoDoExtrato, 'descontaTaxa' | 'regraTipo' | 'baseTaxa' | 'preco'>,
  pagamento: PagamentoDaLinha | null | undefined,
  maquininhas: readonly (Pick<Maquininha, 'id' | 'taxas' | 'cobraPorBandeira' | 'porBandeira'>)[],
): string | null {
  if (!pagamento || l.preco == null || !l.descontaTaxa || l.regraTipo !== 'PERCENTAGE' || l.baseTaxa > 0.005) return null
  const metodo = pagamento.payment_method
  if (metodo !== 'CREDIT_CARD' && metodo !== 'DEBIT_CARD') return null
  const m = maquininhas.find(x => x.id === pagamento.maquininha_id)
  if (!m) return null
  const vezes = metodo === 'CREDIT_CARD' ? Math.max(1, pagamento.cartao_vezes ?? 1) : 1
  const bandeira = ehBandeira(pagamento.cartao_bandeira) ? pagamento.cartao_bandeira : null
  const { taxa } = taxaNaMaquininha(m, metodo, vezes, bandeira)
  if (taxa != null) return null
  return rotuloDaForma(metodo, metodo === 'CREDIT_CARD' ? vezes : undefined)
}
