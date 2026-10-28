/**
 * O rascunho do atendimento (A31 da simulação de 2026-10-27): o que a
 * profissional escreveu antes de finalizar se perdia ao recarregar.
 *
 * Mora no sessionStorage, por agendamento — sobrevive ao recarregar e MORRE
 * com a aba (decisão do Heitor): texto clínico não fica guardado na máquina
 * da recepção, como ficaria no localStorage. Finalizar (ou salvar no
 * servidor) o apaga. Todo acesso é protegido: o armazenamento pode faltar ou
 * lançar (aba anônima, dados bloqueados, o servidor), e a tela segue sem ele.
 *
 * Desde o D3 da simulação de 2026-10-28 guarda também as dores, a anamnese
 * digitada e os insumos (a dose ajustada e o marcado): recarregar apagava os
 * três.
 */

export interface InsumoDoRascunho {
  productId: string
  name:      string
  unit:      string
  quantity:  number
  marcado:   boolean
}

export interface RascunhoDoAtendimento {
  /** A evolução e a intercorrência do formulário de sempre. */
  notes?:          string
  intercurrences?: string
  /** As da avaliação (o formulário com o plano). */
  evalNotes?:      string
  evalInterc?:     string
  /** As "Dores do cliente". */
  queixas?:        string
  /** As respostas da anamnese digitadas na tela (só quando alguém mexeu). */
  anamnese?:       Record<string, string | string[]>
  /** Os insumos da tela (só quando alguém mexeu): a lista inteira, com a dose e o marcado. */
  insumos?:        InsumoDoRascunho[]
}

const TEXTOS = ['notes', 'intercurrences', 'evalNotes', 'evalInterc', 'queixas'] as const

export function chaveDoRascunho(appointmentId: string): string {
  return `bellaris:rascunho-do-atendimento:${appointmentId}`
}

function daSessao(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

/** Só as respostas de texto (ou lista de texto) — o que a ficha de pré-atendimento aceita. */
function anamneseLimpa(v: unknown): Record<string, string | string[]> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const saida: Record<string, string | string[]> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x === 'string') saida[k] = x
    else if (Array.isArray(x) && x.every(i => typeof i === 'string')) saida[k] = x as string[]
  }
  return Object.keys(saida).length ? saida : null
}

function insumosLimpos(v: unknown): InsumoDoRascunho[] | null {
  if (!Array.isArray(v)) return null
  const saida = v.filter((i): i is InsumoDoRascunho => !!i && typeof i === 'object'
    && typeof i.productId === 'string' && typeof i.name === 'string' && typeof i.unit === 'string'
    && typeof i.quantity === 'number' && Number.isFinite(i.quantity) && i.quantity >= 0 && typeof i.marcado === 'boolean')
    .map(i => ({ productId: i.productId, name: i.name, unit: i.unit, quantity: i.quantity, marcado: i.marcado }))
  return saida.length ? saida : null
}

const temTexto = (v: string | string[]) => (Array.isArray(v) ? v.some(x => x.trim() !== '') : v.trim() !== '')

export function lerRascunho(appointmentId: string, armazem: Storage | null = daSessao()): RascunhoDoAtendimento | null {
  try {
    const texto = armazem?.getItem(chaveDoRascunho(appointmentId))
    if (!texto) return null
    const lido = JSON.parse(texto) as Record<string, unknown> | null
    if (!lido || typeof lido !== 'object') return null
    const r: RascunhoDoAtendimento = {}
    for (const c of TEXTOS) if (typeof lido[c] === 'string') r[c] = lido[c] as string
    const anamnese = anamneseLimpa(lido.anamnese)
    if (anamnese) r.anamnese = anamnese
    const insumos = insumosLimpos(lido.insumos)
    if (insumos) r.insumos = insumos
    return Object.keys(r).length ? r : null
  } catch {
    return null
  }
}

export function gravarRascunho(appointmentId: string, r: RascunhoDoAtendimento, armazem: Storage | null = daSessao()): void {
  try {
    if (!armazem) return
    const chave = chaveDoRascunho(appointmentId)
    const limpo: RascunhoDoAtendimento = {}
    for (const c of TEXTOS) if (typeof r[c] === 'string') limpo[c] = r[c]
    const anamnese = anamneseLimpa(r.anamnese)
    if (anamnese && Object.values(anamnese).some(temTexto)) limpo.anamnese = anamnese
    const insumos = insumosLimpos(r.insumos)
    if (insumos) limpo.insumos = insumos
    const comAlgo = TEXTOS.some(c => (limpo[c] ?? '').trim() !== '') || !!limpo.anamnese || !!limpo.insumos
    if (!comAlgo) { armazem.removeItem(chave); return }
    armazem.setItem(chave, JSON.stringify(limpo))
  } catch {
    // Sem armazenamento (cheio, bloqueado): fica sem rascunho, nada mais.
  }
}

export function limparRascunho(appointmentId: string, armazem: Storage | null = daSessao()): void {
  try { armazem?.removeItem(chaveDoRascunho(appointmentId)) } catch { /* idem */ }
}
