import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao } from '@estetica-os/types'

/**
 * "Ligar a automação?" — o que a tela diz ANTES de ligar um fluxo que chega à
 * cliente (C65, H1 do levantamento das regras; A10 da 14ª simulação, F71).
 *
 * A regra é UMA, e mora aqui: todo fluxo com o passo "Mandar mensagem" chega
 * à cliente, por qualquer canal — o WhatsApp, o aviso no celular (push), o
 * Instagram, o Messenger. A janela abre para todos; até a F71 ela só abria
 * para o WhatsApp, e o modelo da rede sem WhatsApp (que nasce em push) ligava
 * calado. Avisar a equipe, marcar tag, mover etapa e anotar não chegam à
 * cliente: ligam direto.
 *
 * A conta (`contarAntesDeLigar`) é do servidor; aqui ficam a decisão e o
 * texto, sem nada do servidor (o editor importa).
 */

export type CanalParaACliente = 'whatsapp' | 'push' | 'instagram' | 'messenger'

const CANAIS: readonly CanalParaACliente[] = ['whatsapp', 'push', 'instagram', 'messenger']

/** Os canais por onde o fluxo fala com a cliente, sem repetir. Vazio: não chega a ela. */
export function canaisParaACliente(grafo: Pick<GrafoDeAutomacao, 'nos'>): CanalParaACliente[] {
  const achados = new Set<CanalParaACliente>()
  for (const n of grafo.nos ?? []) {
    if (n.tipo !== NODES.ACAO_MENSAGEM) continue
    const canal = (n.config as { canal?: string } | null)?.canal
    achados.add(CANAIS.includes(canal as CanalParaACliente) ? canal as CanalParaACliente : 'whatsapp')
  }
  return CANAIS.filter(c => achados.has(c))
}

export interface ContaAntesDeLigar {
  porBusca:     boolean
  quantas:      number
  truncado:     boolean
  /** Entre as achadas, as que têm a conversa do WhatsApp (só quando o fluxo manda WhatsApp). */
  comConversa?: number
  /** Entre as achadas, as que têm o app ou os avisos do navegador (só quando manda push). */
  comAparelho?: number
}

/** "Hoje a busca acharia 4 clientes, e 2 têm conversa aberta no WhatsApp." */
export function textoAntesDeLigar(r: ContaAntesDeLigar): string {
  const clientes = (n: number) => `${n} ${n === 1 ? 'cliente' : 'clientes'}`
  const base = r.porBusca
    ? `Hoje a busca acharia ${clientes(r.quantas)}${r.truncado ? ' (o teto do passo)' : ''}`
    : `Hoje a clínica tem ${r.quantas} ${r.quantas === 1 ? 'cliente ativa' : 'clientes ativas'}`
  if (r.quantas === 0) return `${base}.`
  const partes: string[] = []
  if (r.comConversa !== undefined) {
    partes.push(`${r.comConversa} ${r.comConversa === 1 ? 'tem' : 'têm'} conversa aberta no WhatsApp`)
  }
  if (r.comAparelho !== undefined) {
    partes.push(`${r.comAparelho} ${r.comAparelho === 1 ? 'vai' : 'vão'} receber o aviso no celular`)
  }
  if (!partes.length) return `${base}.`
  return `${base}, e ${partes.join(', e ')}.`
}

/** Por onde a mensagem chega, e a quem — uma frase por canal do fluxo. */
export function explicacaoAntesDeLigar(canais: CanalParaACliente[]): string {
  const frases: string[] = []
  if (canais.includes('whatsapp')) {
    frases.push('Ela manda mensagem pelo WhatsApp, e a mensagem só chega a quem tem conversa aberta com a clínica: a automação não abre conversa nova.')
  }
  if (canais.includes('push')) {
    frases.push('O aviso no celular só chega a quem tem o app da clínica ou os avisos ligados no navegador.')
  }
  const sociais = canais.filter(c => c === 'instagram' || c === 'messenger')
  if (sociais.length) {
    const nomes = sociais.map(c => (c === 'instagram' ? 'o Instagram' : 'o Messenger')).join(' e ')
    frases.push(`Por ${nomes}, a mensagem só chega a quem já tem conversa ali com a clínica.`)
  }
  return frases.join(' ')
}
