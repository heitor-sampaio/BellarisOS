import { NODES } from '@estetica-os/types'
import type {
  GrafoDeAutomacao, NoDoGrafo, ConfigCondicaoSe, ConfigCondicaoEscolha, ConfigEsperaAte,
} from '@estetica-os/types'
import { avaliarGrupo, escolherSaida, caminhosDoCampo, valorDoCampo } from './condicoes'
import { hidratarParaCaminhos, type ContextoDaExecucao, type EventoDoGatilho } from './contexto'
import { chaveDoPasso, nomeDoPasso } from './passos'

/**
 * A mensagem que o silêncio noturno RETEVE, na hora de sair (D2 da 19ª
 * simulação, 2026-11-16; princípios 3 e 6).
 *
 * O silêncio prende a mensagem DENTRO do passo "Mandar mensagem", depois do
 * "Se" que conferiu o agendamento. Entre a retenção e as 08:00 o atendimento
 * pode ter sido concluído, cancelado ou marcado como falta — e o horário pode
 * ter passado. Por isso, ao sair do silêncio:
 *
 *  - as entidades que mudam de situação (o agendamento, a oportunidade) são
 *    lidas DE NOVO, e cada condição do caminho até a mensagem ("Se",
 *    "Escolher") é refeita: a saída que ela der agora tem de ser a que o
 *    fluxo tomou. Se mudou, a mensagem não sai, e o passo diz qual condição;
 *  - a espera "até antes de uma data" (o "1 dia antes do agendamento") diz que
 *    a mensagem é sobre um momento por vir: se ele já passou, a mensagem não
 *    sai.
 */

/** As entidades que a hidratação guardou no contexto e cuja situação muda. */
const RELER = ['agendamento', 'lead'] as const

export function retidaPeloSilencio(contexto: ContextoDaExecucao, no: NoDoGrafo, grafo: GrafoDeAutomacao): boolean {
  const passos = (contexto.passos ?? {}) as Record<string, unknown>
  const doPasso = passos[chaveDoPasso(no, grafo)] as { adiado?: unknown } | undefined
  return !!doPasso?.adiado
}

/** Os passos ANTES deste no grafo (todos os caminhos que chegam a ele). */
function antecessores(grafo: GrafoDeAutomacao, noId: string): NoDoGrafo[] {
  const porId = new Map(grafo.nos.map(n => [n.id, n]))
  const vistos = new Set<string>()
  const fila = [noId]
  while (fila.length) {
    const atual = fila.shift()!
    for (const l of grafo.ligacoes) {
      if (l.para !== atual || vistos.has(l.de)) continue
      vistos.add(l.de)
      fila.push(l.de)
    }
  }
  return [...vistos].map(id => porId.get(id)).filter((n): n is NoDoGrafo => !!n)
}

export async function reconferirDepoisDoSilencio(
  grafo:    GrafoDeAutomacao,
  no:       NoDoGrafo,
  contexto: ContextoDaExecucao,
  evento:   EventoDoGatilho,
  tenantId: string,
  agora = new Date(),
): Promise<{ seguir: true } | { seguir: false; motivo: string }> {
  for (const chave of RELER) delete contexto[chave]

  const passos = (contexto.passos ?? {}) as Record<string, Record<string, unknown> | undefined>
  const antes = antecessores(grafo, no.id)

  for (const anterior of antes) {
    const feito = passos[chaveDoPasso(anterior, grafo)]
    if (!feito) continue // não foi por este caminho

    if (anterior.tipo === NODES.CONDICAO_SE) {
      const cfg = anterior.config as ConfigCondicaoSe
      await hidratarParaCaminhos(contexto, evento, tenantId,
        (cfg.grupo?.regras ?? []).flatMap(r => caminhosDoCampo(r.campo)))
      const agoraDa = avaliarGrupo(contexto, cfg.grupo) ? 'sim' : 'não'
      if (feito.resultado && agoraDa !== feito.resultado) {
        return { seguir: false, motivo: `Durante o silêncio, "${nomeDoPasso(anterior, grafo)}" mudou de ${feito.resultado} para ${agoraDa}: a mensagem não saiu.` }
      }
    }

    if (anterior.tipo === NODES.CONDICAO_ESCOLHA) {
      const cfg = anterior.config as ConfigCondicaoEscolha
      await hidratarParaCaminhos(contexto, evento, tenantId, caminhosDoCampo(cfg.campo))
      const saida = escolherSaida(contexto, cfg.campo, cfg.casos ?? [])
      if (feito.saida !== undefined && saida !== feito.saida) {
        return { seguir: false, motivo: `Durante o silêncio, "${nomeDoPasso(anterior, grafo)}" mudou de caminho: a mensagem não saiu.` }
      }
    }

    if (anterior.tipo === NODES.ESPERA_ATE) {
      const cfg = anterior.config as ConfigEsperaAte
      if (Number(cfg.minutos ?? 0) >= 0) continue // depois do momento: não é aviso de algo por vir
      await hidratarParaCaminhos(contexto, evento, tenantId, caminhosDoCampo(cfg.campo ?? ''))
      const bruto = valorDoCampo(contexto, cfg.campo ?? '')
      const momento = bruto ? new Date(String(bruto)) : null
      if (momento && !Number.isNaN(momento.getTime()) && momento.getTime() <= agora.getTime()) {
        return { seguir: false, motivo: 'O horário já passou durante o silêncio: a mensagem não saiu.' }
      }
    }
  }

  return { seguir: true }
}
