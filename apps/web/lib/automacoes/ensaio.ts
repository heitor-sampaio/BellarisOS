import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao } from '@estetica-os/types'

/**
 * O ensaio cabe nesta automação? Ele repete "um fato que aconteceu de verdade"
 * (automacoes RX-03): só o gatilho de FATO tem um para repetir; o de relógio
 * (aniversário, vencimento de pacote) não. Sem isto o "Ensaiar com o último
 * fato" aparecia na automação de relógio e sempre recusava (D9 da 30ª) — a
 * tela esconde o botão que não se usa (CLAUDE.md §14), e a action recusa pela
 * mesma regra. Puro: a action e o painel dividem.
 */
export function ensaioCabe(grafo: GrafoDeAutomacao | null | undefined): boolean {
  return (grafo?.nos ?? []).some(n => n.tipo === NODES.GATILHO_EVENTO)
}
