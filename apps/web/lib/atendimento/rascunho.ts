/**
 * O rascunho das anotações do atendimento (A31 da simulação de 2026-10-27):
 * o que a profissional escreveu antes de finalizar se perdia ao recarregar.
 *
 * Mora no sessionStorage, por agendamento — sobrevive ao recarregar e MORRE
 * com a aba (decisão do Heitor): texto clínico não fica guardado na máquina
 * da recepção, como ficaria no localStorage. Finalizar (ou salvar no
 * servidor) o apaga. Todo acesso é protegido: o armazenamento pode faltar ou
 * lançar (aba anônima, dados bloqueados, o servidor), e a tela segue sem ele.
 */

export interface RascunhoDoAtendimento {
  /** A evolução e a intercorrência do formulário de sempre. */
  notes?:          string
  intercurrences?: string
  /** As da avaliação (o formulário com o plano). */
  evalNotes?:      string
  evalInterc?:     string
}

const CAMPOS = ['notes', 'intercurrences', 'evalNotes', 'evalInterc'] as const

export function chaveDoRascunho(appointmentId: string): string {
  return `bellaris:rascunho-do-atendimento:${appointmentId}`
}

function daSessao(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

export function lerRascunho(appointmentId: string, armazem: Storage | null = daSessao()): RascunhoDoAtendimento | null {
  try {
    const texto = armazem?.getItem(chaveDoRascunho(appointmentId))
    if (!texto) return null
    const lido = JSON.parse(texto) as Record<string, unknown> | null
    if (!lido || typeof lido !== 'object') return null
    const r: RascunhoDoAtendimento = {}
    for (const c of CAMPOS) if (typeof lido[c] === 'string') r[c] = lido[c] as string
    return Object.keys(r).length ? r : null
  } catch {
    return null
  }
}

export function gravarRascunho(appointmentId: string, r: RascunhoDoAtendimento, armazem: Storage | null = daSessao()): void {
  try {
    if (!armazem) return
    const chave = chaveDoRascunho(appointmentId)
    const comTexto = CAMPOS.some(c => (r[c] ?? '').trim() !== '')
    if (!comTexto) { armazem.removeItem(chave); return }
    const limpo: RascunhoDoAtendimento = {}
    for (const c of CAMPOS) if (typeof r[c] === 'string') limpo[c] = r[c]
    armazem.setItem(chave, JSON.stringify(limpo))
  } catch {
    // Sem armazenamento (cheio, bloqueado): fica sem rascunho, nada mais.
  }
}

export function limparRascunho(appointmentId: string, armazem: Storage | null = daSessao()): void {
  try { armazem?.removeItem(chaveDoRascunho(appointmentId)) } catch { /* idem */ }
}
