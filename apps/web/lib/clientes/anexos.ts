import { dayKeyTZ } from '@/lib/datetime'

/**
 * Anexos do cliente que são PRONTUÁRIO: exame, laudo, foto clínica, receita e
 * termo de consentimento.
 *
 * Ficavam sob o módulo de clientes — quem só tinha a recepção via e anexava
 * laudo de paciente (corrigido em 2026-10-03). Ver, baixar, anexar e apagar
 * um destes pede o módulo de prontuário, como o resto do dado clínico.
 */
export const CATEGORIAS_CLINICAS: ReadonlySet<string> = new Set([
  'termo_consentimento', 'exame', 'laudo', 'foto_clinica', 'receita',
])

export function ehAnexoClinico(categoria: string | null | undefined): boolean {
  return !!categoria && CATEGORIAS_CLINICAS.has(categoria)
}

/** O atendimento de onde o anexo veio (a foto pela tela do atendimento). */
export interface AtendimentoDoAnexo { id: string; rotulo: string }

/**
 * "Atendimento de 27/10/2026 · Toxina" — o dia no fuso do negócio (o servidor
 * roda em UTC). Nulo quando o anexo foi posto pela ficha.
 */
export function atendimentoDoAnexo(
  ag: { id: string; scheduled_at: string; procedures: { name: string } | null } | null | undefined,
): AtendimentoDoAnexo | null {
  if (!ag) return null
  const [ano, mes, dia] = dayKeyTZ(ag.scheduled_at).split('-')
  const proc = ag.procedures?.name
  return { id: ag.id, rotulo: `Atendimento de ${dia}/${mes}/${ano}${proc ? ` · ${proc}` : ''}` }
}
