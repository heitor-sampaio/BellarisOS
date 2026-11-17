import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao, LimitesDaAutomacao } from '@estetica-os/types'
import { normalizarHorario, HORARIO_PADRAO } from '@/lib/agenda/horario'

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
  /** As unidades ativas e o horário delas, para dizer quem atende no silêncio (A15 da 20ª). */
  unidades?: { nome: string; horario: unknown }[]
}

/** "Hoje a busca acharia 4 clientes, e 2 têm conversa aberta no WhatsApp." */
export function textoAntesDeLigar(r: ContaAntesDeLigar): string {
  const clientes = (n: number) => `${n} ${n === 1 ? 'cliente' : 'clientes'}`
  const base = r.porBusca
    ? `Hoje a busca acharia ${clientes(r.quantas)}${r.truncado ? ' (o teto do passo)' : ''}`
    : `Hoje a rede tem ${r.quantas} ${r.quantas === 1 ? 'cliente ativa' : 'clientes ativas'}`
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
    frases.push('Ela manda mensagem pelo WhatsApp, e a mensagem só chega a quem tem conversa aberta com a rede: a automação não abre conversa nova.')
  }
  if (canais.includes('push')) {
    frases.push('O aviso no celular só chega a quem tem o app ou os avisos ligados no navegador.')
  }
  const sociais = canais.filter(c => c === 'instagram' || c === 'messenger')
  if (sociais.length) {
    const nomes = sociais.map(c => (c === 'instagram' ? 'o Instagram' : 'o Messenger')).join(' e ')
    frases.push(`Por ${nomes}, a mensagem só chega a quem já tem conversa ali com a rede.`)
  }
  return frases.join(' ')
}

/**
 * Os limites do fluxo, ditos ANTES de ligar (A16 da 19ª simulação; princípios
 * 1 e 7): o silêncio noturno padrão (21:00–08:00) segurou o lembrete de uma
 * rede aberta 24 horas, e quem ligou o modelo nunca abriu a gaveta "Limites".
 * O padrão fica (é da rede ajustar — D16); a janela diz o que vale.
 */
export function limitesAntesDeLigar(l: LimitesDaAutomacao): string {
  const silencio = l.silencioDe && l.silencioAte
    ? `Entre ${l.silencioDe} e ${l.silencioAte} a mensagem espera e sai às ${l.silencioAte} (silêncio noturno).`
    : 'Sem silêncio: a mensagem sai a qualquer hora.'
  const teto = l.tetoPorClienteDia
    ? `No máximo ${l.tetoPorClienteDia} por cliente por dia.`
    : 'Sem teto por cliente.'
  return `${silencio} ${teto}`
}

const minutosDe = (h: string) => { const [a, b] = h.split(':').map(Number); return a! * 60 + b! }

/**
 * A unidade que ATENDE dentro do silêncio (A15 da 20ª simulação, 2026-11-17;
 * princípios 1 e 3): o silêncio padrão (21:00–08:00) e o Ateliê aberto das
 * 07:00 às 22:00 — a mensagem do fim do dia sai na manhã seguinte, e a janela
 * de ligar não falava do horário da unidade. Diz quais unidades atendem em
 * parte do silêncio, com o horário delas (o mais cedo que abrem e o mais
 * tarde que fecham na semana). O silêncio continua o da rede: ela ajusta.
 * Unidade sem horário cadastrado é o padrão (08:00–20:00).
 */
export function silencioNoHorarioDasUnidades(
  l: LimitesDaAutomacao,
  unidades: readonly { nome: string; horario: unknown }[],
): string | null {
  if (!l.silencioDe || !l.silencioAte) return null
  const de = minutosDe(l.silencioDe), ate = minutosDe(l.silencioAte)
  if (de === ate) return null
  // O silêncio que passa da meia-noite são dois trechos do dia.
  const trechos = de < ate ? [[de, ate]] : [[de, 24 * 60], [0, ate]]
  const dentro: { nome: string; abre: string; fecha: string }[] = []
  for (const u of unidades) {
    const h = normalizarHorario(u.horario) ?? HORARIO_PADRAO
    const intervalos = Object.values(h.dias).flatMap(d => d ?? [])
    if (!intervalos.length) continue
    const cai = intervalos.some(i => trechos.some(([a, b]) => minutosDe(i.de) < b! && minutosDe(i.ate) > a!))
    if (!cai) continue
    const abre = intervalos.map(i => i.de).sort()[0]!
    const fecha = intervalos.map(i => i.ate).sort().at(-1)!
    dentro.push({ nome: u.nome, abre, fecha })
  }
  if (!dentro.length) return null
  if (dentro.length === 1) {
    const u = dentro[0]!
    return `${u.nome} atende das ${u.abre} às ${u.fecha}: parte desse horário está no silêncio.`
  }
  const nomes = dentro.map(u => `${u.nome} (${u.abre} às ${u.fecha})`)
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)} atendem em parte do silêncio.`
}
