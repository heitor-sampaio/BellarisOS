import { NODES, TIPOS_DE_GATILHO, ROTULOS_DE_NO, rotuloDoEvento } from '@estetica-os/types'
import type { GrafoDeAutomacao, NoDoGrafo, TipoDeNo } from '@estetica-os/types'
import { nomeDoDeslocamento } from './deslocamento'

/**
 * O caminho do fluxo, do gatilho para a frente — o card da lista das
 * Automações (`['Agendamento criado', '3 horas antes', 'Se ainda está de pé', 'Lembrete']`).
 *
 * Segue as ligações a partir do gatilho em vez de listar os nodes na ordem em
 * que foram criados: node solto não entra, e quem montou o fluxo de trás para
 * a frente vê a mesma frase de quem montou na ordem. Na bifurcação segue o
 * primeiro ramo — o card resume, não desenha.
 *
 * A espera diz o prazo GRAVADO, não o nome do passo (D8 da 30ª; princípio 3):
 * o lembrete de 3 horas aparecia como "Um dia antes", o nome que o passo
 * trouxe do modelo. Puro (saiu de `actions/automacoes.ts` para ser testado).
 */
export function caminhoDoFluxo(grafo: GrafoDeAutomacao | null): string[] {
  const nos = grafo?.nos ?? []
  if (nos.length === 0) return []

  const inicio = nos.find(n => (TIPOS_DE_GATILHO as readonly string[]).includes(n.tipo))
  if (!inicio) return []

  const nome = (no: NoDoGrafo): string => {
    const c = (no.config ?? {}) as { evento?: string; minutos?: number; quantidade?: number; unidade?: string }
    // No gatilho de evento, o evento diz mais que o rótulo do node: entre
    // "Quando acontecer" e "Mensagem recebida", a segunda é a informação.
    if (c.evento) return rotuloDoEvento(c.evento)
    if (no.tipo === NODES.ESPERA_ATE) return nomeDoDeslocamento(Number(c.minutos ?? -1440))
    if (no.tipo === NODES.ESPERA_DURACAO) {
      const n = Number(c.quantidade ?? 1)
      const [um, varios] = ({ minutos: ['minuto', 'minutos'], horas: ['hora', 'horas'], dias: ['dia', 'dias'] } as Record<string, [string, string]>)[c.unidade ?? 'dias'] ?? ['dia', 'dias']
      return `Esperar ${n} ${n === 1 ? um : varios}`
    }
    return no.nome?.trim() || ROTULOS_DE_NO[no.tipo as TipoDeNo] || no.tipo
  }

  const caminho: string[] = []
  const vistos = new Set<string>()
  let atual: NoDoGrafo | undefined = inicio

  // Teto de 4: o card tem uma linha, e "…" já diz que o fluxo continua.
  while (atual && caminho.length < 4 && !vistos.has(atual.id)) {
    vistos.add(atual.id)
    caminho.push(nome(atual))
    const proxima = (grafo?.ligacoes ?? []).find(l => l.de === atual!.id)
    atual = proxima ? nos.find(n => n.id === proxima.para) : undefined
  }
  return caminho
}
