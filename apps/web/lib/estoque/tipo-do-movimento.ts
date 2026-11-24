import { rotuloDoMotivo } from '@/lib/estoque/perda'

/**
 * O tipo de um movimento de estoque como se lê na lista de Relatórios →
 * Estoque (item 6 do escopo de 18/11): entrada, consumo, venda, perda, ajuste
 * ou transferência — e o rótulo da linha, com o que o Histórico do produto já
 * distingue (a entrada desfeita, o brinde da fidelidade, a correção de
 * cadastro, a perda com o motivo). Puro: a tela e o teste usam a mesma regra.
 */
export type TipoDoMovimento = 'ENTRADA' | 'CONSUMO' | 'VENDA' | 'PERDA' | 'AJUSTE' | 'TRANSFERENCIA'

export const ROTULO_DO_TIPO_DE_MOVIMENTO: Record<TipoDoMovimento, string> = {
  ENTRADA: 'Entrada', CONSUMO: 'Consumo', VENDA: 'Venda', PERDA: 'Perda', AJUSTE: 'Ajuste', TRANSFERENCIA: 'Transferência',
}

export function tipoDoMovimento(m: {
  type: string
  quantity: number
  reference: string | null
  /** O ajuste da "Correção de cadastro" (A10 da 24ª). */
  correcao: boolean
  /** O nome do motivo gravado na perda. */
  motivo: string | null
  /** Este movimento desfaz outro (o ajuste). */
  desfaz?: boolean
}): { tipo: TipoDoMovimento; rotulo: string } {
  switch (m.type) {
    case 'PURCHASE':
      return { tipo: 'ENTRADA', rotulo: m.quantity < 0 ? 'Entrada desfeita' : 'Entrada' }
    case 'PROCEDURE_USAGE':
      return { tipo: 'CONSUMO', rotulo: 'Consumo em atendimento' }
    case 'SALE':
      return { tipo: 'VENDA', rotulo: 'Venda' }
    case 'SALE_RETURN':
      return { tipo: 'VENDA', rotulo: 'Devolução de venda' }
    case 'LOSS':
      return m.quantity > 0
        ? { tipo: 'PERDA', rotulo: 'Perda desfeita' }
        : { tipo: 'PERDA', rotulo: m.motivo ? `Perda: ${rotuloDoMotivo(m.motivo)}` : 'Perda' }
    case 'MANUAL_ADJUSTMENT':
      if ((m.reference ?? '').startsWith('voucher:')) return { tipo: 'PERDA', rotulo: 'Brinde da fidelidade' }
      if (m.desfaz) return { tipo: 'AJUSTE', rotulo: 'Ajuste desfeito' }
      if (m.correcao) return { tipo: 'AJUSTE', rotulo: 'Correção de cadastro' }
      return { tipo: 'AJUSTE', rotulo: 'Ajuste de inventário' }
    case 'TRANSFER_OUT':
      return { tipo: 'TRANSFERENCIA', rotulo: 'Transferência enviada' }
    case 'TRANSFER_IN':
      return { tipo: 'TRANSFERENCIA', rotulo: 'Transferência recebida' }
    default:
      return { tipo: 'AJUSTE', rotulo: m.type }
  }
}
