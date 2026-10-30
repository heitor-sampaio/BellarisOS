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

export function rotuloDoMotivo(v: string | null | undefined): string {
  return MOTIVOS_DA_PERDA.find(m => m.key === v)?.label ?? '—'
}
