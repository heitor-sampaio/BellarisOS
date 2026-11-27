import { formatBRL } from '@estetica-os/utils'
import { rotuloDaForma, maquininhaDoRotulo } from '@/lib/financeiro/formas'

/**
 * As formas em que o atendimento foi pago (D8 da 39ª, princípio 3): pago em
 * Pix R$ 100 + Débito R$ 62, o "Pagamento confirmado" dizia só o Pix — a tela
 * pegava o PRIMEIRO lançamento pago. Aqui, todos os pagos e vivos (sem a ponta
 * estornada), a maior forma primeiro (a ordem das formas da parcela, decisão do
 * Claude de 27/11). Puro: serve à tela do atendimento e à janela da agenda.
 */

export interface LancamentoDoPagamento {
  id: string
  payment_method: string | null
  amount: number | string
  cartao_vezes: number | null
  cartao_bandeira: string | null
  maquininha_id: string | null
  is_paid: boolean
  notes: string | null
}

export interface FormaDoPagamento {
  id: string
  paymentMethod: string
  amount: number
  cartaoVezes: number | null
  cartaoBandeira: string | null
  /** O nome da maquininha, só quando a rede tem mais de uma (`maquininhaDoRotulo`). */
  maquininha: string | null
}

export function formasDoPagamentoDoAtendimento(
  lancamentos: readonly LancamentoDoPagamento[],
  maquininhas: Record<string, string> | null,
): FormaDoPagamento[] {
  return lancamentos
    .filter(l => l.is_paid && l.notes !== 'Estornada')
    .map(l => ({
      id: l.id,
      // Sem forma (o pago só com pontos): "Sem forma de pagamento" (rotuloDaForma).
      paymentMethod: l.payment_method ?? '',
      amount: Number(l.amount),
      cartaoVezes: l.cartao_vezes,
      cartaoBandeira: l.cartao_bandeira,
      maquininha: maquininhaDoRotulo(maquininhas, l.maquininha_id),
    }))
    .sort((a, b) => b.amount - a.amount || a.paymentMethod.localeCompare(b.paymentMethod) || a.id.localeCompare(b.id))
}

/** O rótulo de UMA forma: "Débito Visa · Stone". */
export function rotuloDaFormaDoPagamento(f: FormaDoPagamento): string {
  return rotuloDaForma(f.paymentMethod, f.cartaoVezes, { bandeira: f.cartaoBandeira, maquininha: f.maquininha })
}

/** "Pix · R$ 100,00 + Débito · R$ 62,00" — uma forma só, como era: "Crédito Visa 5x · R$ 300,00". */
export function pagamentoConfirmadoEmTexto(formas: readonly FormaDoPagamento[]): string {
  return formas.map(f => `${rotuloDaFormaDoPagamento(f)} · ${formatBRL(f.amount)}`).join(' + ')
}
