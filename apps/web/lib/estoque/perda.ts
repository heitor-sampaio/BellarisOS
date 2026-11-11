/**
 * Os motivos da saída por PERDA (D-7, decisão do Heitor, 2026-10-29) — puro:
 * o formulário, o histórico e o relatório usam os mesmos nomes. O banco
 * confere a mesma lista (`stock_movements_motivo_da_perda_check`).
 */
export type MotivoDaPerda = 'VENCIDO' | 'QUEBROU' | 'AMOSTRA' | 'USO_INTERNO'

export const MOTIVOS_DA_PERDA: { key: MotivoDaPerda; label: string }[] = [
  { key: 'VENCIDO',     label: 'Vencido' },
  { key: 'QUEBROU',     label: 'Quebrou' },
  { key: 'AMOSTRA',     label: 'Amostra' },
  { key: 'USO_INTERNO', label: 'Uso interno' },
]

export function lerMotivoDaPerda(v: unknown): MotivoDaPerda | null {
  return MOTIVOS_DA_PERDA.some(m => m.key === v) ? v as MotivoDaPerda : null
}

/**
 * A venda de produto estornada cujo produto NÃO voltou (H2, decisão do Heitor,
 * 2026-11-01) também é perda no relatório (`metrics_perdas`), mas não é um
 * motivo que se escolhe no formulário: nasce do estorno.
 */
export const MOTIVO_VENDA_ESTORNADA = 'VENDA_ESTORNADA'

/**
 * O ajuste de inventário que contou MENOS que o saldo (D5 da 10ª simulação,
 * 2026-11-10) também é perda no relatório (`metrics_perdas`), ao custo do
 * lote de onde saiu. Nasce do Ajuste, não se escolhe na Perda.
 */
export const MOTIVO_INVENTARIO = 'INVENTARIO'

/**
 * O brinde da fidelidade entregue (A40 da 12ª simulação, 2026-11-11): sai do
 * estoque pelo voucher e é perda no relatório, pelo custo do lote. Nasce da
 * entrega do voucher, não se escolhe na Perda.
 */
export const MOTIVO_BRINDE = 'BRINDE'

export function rotuloDoMotivo(v: string | null | undefined): string {
  if (v === MOTIVO_VENDA_ESTORNADA) return 'Venda estornada (não voltou)'
  if (v === MOTIVO_INVENTARIO) return 'Inventário'
  if (v === MOTIVO_BRINDE) return 'Brinde da fidelidade'
  return MOTIVOS_DA_PERDA.find(m => m.key === v)?.label ?? '—'
}
