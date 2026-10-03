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
