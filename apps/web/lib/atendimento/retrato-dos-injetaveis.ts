import { flattenFields, type AnamnesisRow, type InjectableMapValue } from '@/lib/anamnesis'

/**
 * O planejador de injetáveis da ficha do procedimento (pedido do Heitor,
 * 2026-10-29). O campo deixou de ser um mapa SOLTO: no atendimento ele abre o
 * planejamento da cliente (`injectable_maps`), e a resposta guarda o id do
 * planejamento usado e um RETRATO dos pontos de quando a ficha é salva ou o
 * atendimento finalizado — o prontuário mostra o que foi planejado naquele
 * dia, mesmo que o planejamento mude depois.
 *
 * O retrato sai do planejamento GRAVADO, lido no servidor (com a rede, a
 * unidade, a cliente do atendimento e o "só os meus" conferidos): o navegador
 * diz qual planejamento, nunca os pontos. A resposta antiga (o mapa solto,
 * sem `planejamento`) fica como está.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEM_NOME = 'Planejamento sem nome'
export const RECUSA_DO_PLANEJAMENTO = 'Planejamento de injetáveis não encontrado para esta cliente.'

/** O planejamento como o servidor o leu, para retratar. */
export interface PlanejamentoParaRetrato {
  id:     string
  name:   string | null
  view:   string | null
  points: unknown
}

/** A resposta pede um planejamento? `undefined`: não pede (mapa solto ou vazio); `null`: pede, com id inválido. */
function pedido(valor: unknown): string | null | undefined {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return undefined
  const p = (valor as { planejamento?: unknown }).planejamento
  if (p === undefined || p === null) return undefined
  const id = typeof p === 'object' ? (p as { id?: unknown }).id : undefined
  return typeof id === 'string' && UUID.test(id) ? id : null
}

function camposDoPlanejador(rows: AnamnesisRow[]): string[] {
  return flattenFields({ rows }).filter(f => f.type === 'injectable_map').map(f => f.id)
}

/** Os ids de planejamento que as respostas usam — só nos campos do planejador. */
export function planejamentosDaFicha(rows: AnamnesisRow[], answers: Record<string, unknown>): string[] {
  const ids = new Set<string>()
  for (const campo of camposDoPlanejador(rows)) {
    const id = pedido(answers?.[campo])
    if (id) ids.add(id)
  }
  return [...ids]
}

/**
 * As respostas com o retrato de cada planejamento usado. `mapas` são os que
 * QUEM AGE pode retratar para ESTA cliente; fora deles (outra cliente, outra
 * rede, id inválido), recusa — nada de gravar um planejamento de mentira.
 */
export function comRetratos(
  rows: AnamnesisRow[],
  answers: Record<string, unknown>,
  mapas: Map<string, PlanejamentoParaRetrato>,
  agora: string,
): { answers: Record<string, unknown> } | { error: string } {
  const saida: Record<string, unknown> = { ...answers }
  for (const campo of camposDoPlanejador(rows)) {
    const id = pedido(answers?.[campo])
    if (id === undefined) continue
    const mapa = id ? mapas.get(id) : undefined
    if (!mapa) return { error: RECUSA_DO_PLANEJAMENTO }
    const retrato: InjectableMapValue = {
      view:         (mapa.view as InjectableMapValue['view'] | null) ?? 'rosto_f',
      points:       Array.isArray(mapa.points) ? (mapa.points as InjectableMapValue['points']) : [],
      confirmedAt:  null,
      planejamento: { id: mapa.id, nome: mapa.name?.trim() || SEM_NOME },
      retratoEm:    agora,
    }
    saida[campo] = retrato
  }
  return { answers: saida }
}
