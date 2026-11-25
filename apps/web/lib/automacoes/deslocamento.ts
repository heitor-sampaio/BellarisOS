import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao, NoDoGrafo } from '@estetica-os/types'
import { slugDoPasso, nomeDoPasso } from './passos'

/**
 * O deslocamento do "Esperar até" (`config.minutos`: negativo = antes, positivo
 * = depois, 0 = no momento exato), em partes que a tela edita e em palavras.
 *
 * O prazo é da rede (princípios 1 e 2 — "não recusar o valor que a rede
 * escolheu (… prazo)"; A27 da 30ª): era uma lista fixa (2 dias, 1 dia, 3 h,
 * 1 h antes…), e "6 horas antes" não existia. Agora é quantidade, unidade e
 * sentido; o motor sempre leu qualquer número de minutos.
 *
 * Puro: serve à lista (servidor), ao painel e ao editor (navegador).
 */

export type UnidadeDoDeslocamento = 'minutos' | 'horas' | 'dias'
export type SentidoDoDeslocamento = 'antes' | 'depois'
export interface PartesDoDeslocamento {
  quantidade: number
  unidade:    UnidadeDoDeslocamento
  sentido:    SentidoDoDeslocamento
}

const FATOR: Record<UnidadeDoDeslocamento, number> = { minutos: 1, horas: 60, dias: 1440 }
const NOMES: Record<UnidadeDoDeslocamento, [string, string]> = {
  minutos: ['minuto', 'minutos'], horas: ['hora', 'horas'], dias: ['dia', 'dias'],
}

/**
 * A maior unidade que divide os minutos inteiros: -360 → 6 horas antes. Zero
 * fica em horas (o campo mais comum). Com a unidade que a pessoa escolheu
 * (`preferida`), ela fica enquanto dividir: quem digita "48" horas não vê o
 * campo virar "2" dias no meio.
 */
export function partesDoDeslocamento(minutos: number, preferida?: UnidadeDoDeslocamento): PartesDoDeslocamento {
  const m = Math.round(Number(minutos) || 0)
  const abs = Math.abs(m)
  const sentido: SentidoDoDeslocamento = m > 0 ? 'depois' : 'antes'
  if (abs === 0) return { quantidade: 0, unidade: preferida ?? 'horas', sentido: 'antes' }
  const unidade: UnidadeDoDeslocamento = preferida && abs % FATOR[preferida] === 0 ? preferida
    : abs % 1440 === 0 ? 'dias' : abs % 60 === 0 ? 'horas' : 'minutos'
  return { quantidade: abs / FATOR[unidade], unidade, sentido }
}

export function minutosDoDeslocamento(p: PartesDoDeslocamento): number {
  const n = Math.max(0, Math.floor(Number(p.quantidade) || 0))
  const total = n * FATOR[p.unidade]
  if (total === 0) return 0
  return p.sentido === 'antes' ? -total : total
}

/** "3 horas antes", "1 dia depois", "No momento exato" — a espera ESCOLHIDA (D8 da 30ª). */
export function nomeDoDeslocamento(minutos: number): string {
  const p = partesDoDeslocamento(minutos)
  if (p.quantidade === 0) return 'No momento exato'
  const [um, varios] = NOMES[p.unidade]
  return `${p.quantidade} ${p.quantidade === 1 ? um : varios} ${p.sentido}`
}

/**
 * O nome que o passo "Esperar até" passa a ter quando o deslocamento muda —
 * ou `null`, quando o nome fica.
 *
 * Acompanha só o nome AUTOMÁTICO: o do deslocamento anterior ("3 horas
 * antes") ou o do modelo de lembrete ("Um dia antes", que nasce com 1 dia). O
 * nome que a rede escreveu é dela e fica. Também fica quando o nome novo já é
 * de outro passo (o nome é a chave dos `passos.*`: dois iguais disputariam a
 * mesma chave).
 */
export function nomeQueAcompanhaODeslocamento(no: NoDoGrafo, minutosNovos: number, grafo: GrafoDeAutomacao): string | null {
  if (no.tipo !== NODES.ESPERA_ATE) return null
  const anterior = Number((no.config as { minutos?: number } | null)?.minutos ?? -1440)
  if (anterior === minutosNovos) return null
  const atual = nomeDoPasso(no, grafo)
  const automaticos = new Set([nomeDoDeslocamento(anterior), ...(anterior === -1440 ? ['Um dia antes'] : [])].map(slugDoPasso))
  if (!automaticos.has(slugDoPasso(atual))) return null
  const novo = nomeDoDeslocamento(minutosNovos)
  const ocupado = grafo.nos.some(n => n.id !== no.id && slugDoPasso(nomeDoPasso(n, grafo)) === slugDoPasso(novo))
  return ocupado ? null : novo
}
