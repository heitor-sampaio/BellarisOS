import { dayKeyTZ, partsInTZ } from '@/lib/datetime'

/**
 * A hora REAL em que o atendimento foi concluído, ao lado da agendada (J-34,
 * 2026-10-30). A agenda e o app da cliente mostravam só a hora marcada: a
 * cliente das 23:30 atendida até 00:22 aparecia "23:30 · concluído".
 *
 * "concluído às 00:22" no mesmo dia (Brasília); em outro dia, com a data:
 * "concluído em 31/10 às 00:22". Sem `completed_at` (o concluído de antes da
 * coluna), nulo — a tela diz só "concluído".
 */
export function textoDoConcluido(agendadoEm: string, concluidoEm: string | null | undefined): string | null {
  if (!concluidoEm) return null
  const fim = new Date(concluidoEm)
  if (Number.isNaN(fim.getTime())) return null
  const p = partsInTZ(fim)
  const hora = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  if (dayKeyTZ(fim) === dayKeyTZ(new Date(agendadoEm))) return `concluído às ${hora}`
  return `concluído em ${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')} às ${hora}`
}
