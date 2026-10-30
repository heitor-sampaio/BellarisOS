import { NODES, SAIDAS_DE, TIPOS_DE_GATILHO } from '@estetica-os/types'
import type { GrafoDeAutomacao, TipoDeNo, ConfigCondicaoEscolha, NoDoGrafo } from '@estetica-os/types'

/**
 * Onde um passo novo nasce no quadro, e a quem ele já nasce ligado (J-14).
 *
 * O passo nascia SOLTO, à direita do último da lista: montar "gatilho → se →
 * avisar" pedia dois arrastos de alça a alça, e o terceiro passo de um fluxo
 * comprido nascia fora da vista. Agora ele nasce ligado ao ANTERIOR — o passo
 * que está aberto no painel ou, sem nenhum aberto, o último que entrou —, pela
 * primeira saída livre dele (no "Se", a Sim; depois, a Não).
 *
 * Não liga quando não há como ligar sem desfazer o que existe: gatilho não tem
 * entrada, e uma saída leva a um lugar só (o quadro recusa duas setas da mesma
 * alça). Aí o passo nasce solto, como antes, e quem monta liga à mão.
 */

const DISTANCIA_X = 280
const DISTANCIA_Y = 150

/** As saídas deste node: fixas no catálogo, ou os casos do "Escolher por" mais o padrão. */
export function saidasDoNo(tipo: TipoDeNo, config: Record<string, unknown>): string[] {
  if (tipo === NODES.CONDICAO_ESCOLHA) {
    const casos = (config as unknown as ConfigCondicaoEscolha).casos ?? []
    // 'padrao' sempre existe: um valor que ninguém previu não pode fazer o
    // fluxo sumir sem deixar rastro.
    return [...casos.map(c => c.chave), 'padrao']
  }
  return [...(SAIDAS_DE[tipo] ?? [])]
}

export interface Encaixe {
  pos: { x: number; y: number }
  /** A ligação do anterior ao novo; ausente quando o passo nasce solto. */
  ligacao?: { de: string; saida?: string }
}

export function encaixarPasso(
  grafo: GrafoDeAutomacao,
  tipo: TipoDeNo,
  anteriorId: string | null,
): Encaixe {
  const anterior: NoDoGrafo | undefined =
    grafo.nos.find(n => n.id === anteriorId) ?? grafo.nos[grafo.nos.length - 1]

  if (!anterior) return { pos: { x: 80, y: 120 } }

  const ocupada = (p: { x: number; y: number }) =>
    grafo.nos.some(n => Math.abs(n.pos.x - p.x) < 200 && Math.abs(n.pos.y - p.y) < 100)
  /** Desce até achar um lugar vazio: dois passos no mesmo ponto escondem um ao outro. */
  const livre = (p: { x: number; y: number }) => {
    let y = p.y
    while (ocupada({ x: p.x, y })) y += DISTANCIA_Y
    return { x: p.x, y }
  }

  const ehGatilho = (TIPOS_DE_GATILHO as readonly string[]).includes(tipo)
  const saidas = saidasDoNo(anterior.tipo, anterior.config as Record<string, unknown>)
  const usadas = grafo.ligacoes.filter(l => l.de === anterior.id)

  // Saída nomeada: a primeira livre, e o passo nasce na altura dela.
  if (saidas.length > 0) {
    const i = saidas.findIndex(s => !usadas.some(l => l.saida === s))
    const base = { x: anterior.pos.x + DISTANCIA_X, y: anterior.pos.y + Math.max(i, 0) * DISTANCIA_Y }
    if (ehGatilho || i < 0) return { pos: livre(base) }
    return { pos: livre(base), ligacao: { de: anterior.id, saida: saidas[i] } }
  }

  const base = { x: anterior.pos.x + DISTANCIA_X, y: anterior.pos.y }
  if (ehGatilho || usadas.length > 0) return { pos: livre(base) }
  return { pos: livre(base), ligacao: { de: anterior.id } }
}
