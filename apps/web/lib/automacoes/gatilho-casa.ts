import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao } from '@estetica-os/types'
import { avaliarGrupo, caminhosDoCampo } from './condicoes'
import {
  contextoDoEvento, hidratarParaCaminhos,
  type ContextoDaExecucao, type EventoDoGatilho,
} from './contexto'

/**
 * O gatilho desta automação aceita este fato? É a régua do despacho
 * (`despacharEvento`) e da pergunta "Mover dispara a automação…?" da tela
 * (A35 da 22ª, `lib/crm/automacoes-do-movimento.ts`): a pergunta só cita a
 * automação que de fato dispararia.
 *
 * - Sem nó de gatilho de evento, não aceita.
 * - O filtro do gatilho roda sobre o fato, hidratando só as entidades que ele
 *   cita. Se a entidade não carrega, não aceita (falha fechada, D3 da 16ª).
 * - `ajustar` mexe no contexto depois de hidratar: a PREVISÃO de um movimento
 *   lê o card antes de ele mudar de etapa, e o ajuste o põe no destino.
 */
export async function gatilhoCasa(
  grafo: GrafoDeAutomacao,
  evento: EventoDoGatilho,
  tenantId: string,
  opcoes: { ajustar?: (contexto: ContextoDaExecucao) => void; rotulo?: string } = {},
): Promise<boolean> {
  const gatilho = grafo.nos?.find(n => n.tipo === NODES.GATILHO_EVENTO)
  if (!gatilho) return false
  const config = gatilho.config as { filtro?: Parameters<typeof avaliarGrupo>[1] }
  if (!config.filtro) return true
  const contexto = contextoDoEvento(evento)
  try {
    await hidratarParaCaminhos(
      contexto, evento, tenantId,
      (config.filtro.regras ?? []).flatMap(r => caminhosDoCampo(r.campo)),
    )
  } catch (e) {
    console.error('[gatilhoCasa] filtro', opcoes.rotulo ?? '', (e as Error).message)
    return false
  }
  opcoes.ajustar?.(contexto)
  return avaliarGrupo(contexto, config.filtro)
}
