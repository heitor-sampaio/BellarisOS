import type { AdicionaisContratados } from './adicionais'
import { reaisDe } from '../redes/valor'

/**
 * CORTESIA e DESCONTO na assinatura da rede (2026-10-07, decisões do Heitor).
 *
 * Por ITEM — o plano, as conexões de WhatsApp, o Copilot avulso —, quem
 * administra o sistema dá:
 *  - `cortesia`: o item de graça;
 *  - `percentual`: X% a menos (1 a 100);
 *  - `valor`: R$ X a menos (nunca abaixo de zero);
 * com data de fim OPCIONAL (`ate`, AAAA-MM-DD, vale o dia inteiro). No dia
 * seguinte ao fim, o item volta sozinho ao preço normal (cron `assinaturas`).
 *
 * Mora em `tenant_subscriptions.condicoes`. A mensalidade (`valor_total_centavos`,
 * o que o Asaas cobra) é a soma de cada item JÁ com a condição — o banco repete
 * esta conta em `private.valor_com_condicao` e no gatilho do total.
 */
export const ITENS_DA_ASSINATURA = ['plano', 'whatsapp', 'copilot'] as const
export type ItemDaAssinatura = (typeof ITENS_DA_ASSINATURA)[number]

export type Condicao =
  | { tipo: 'cortesia'; ate?: string }
  | { tipo: 'percentual'; percentual: number; ate?: string }
  | { tipo: 'valor'; centavos: number; ate?: string }
export type Condicoes = Partial<Record<ItemDaAssinatura, Condicao>>

const DATA = /^\d{4}-\d{2}-\d{2}$/
/** Teto do desconto em reais (R$ 100.000,00): erro de digitação não vira nada estranho. */
const DESCONTO_MAXIMO_CENTAVOS = 10_000_000

/** AAAA-MM-DD que existe (o Date do JS aceitaria 30/02 e viraria 02/03). */
const dataValida = (v: string) => {
  if (!DATA.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/**
 * O mínimo que o Asaas cobra: R$ 5,00. A mensalidade é zero (rede de cortesia)
 * ou pelo menos isso — o banco recusa o meio (gatilho do total).
 */
export const MENSALIDADE_MINIMA_CENTAVOS = 500
export const abaixoDoMinimo = (total: number) => total > 0 && total < MENSALIDADE_MINIMA_CENTAVOS

function montar(e: Record<string, unknown>): Condicao | null {
  const ate = typeof e.ate === 'string' && e.ate ? e.ate : undefined
  const comAte = <T extends object>(c: T): T => (ate ? { ...c, ate } : c)
  if (e.tipo === 'cortesia') return comAte({ tipo: 'cortesia' as const })
  if (e.tipo === 'percentual') {
    const p = e.percentual
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > 100) return null
    return comAte({ tipo: 'percentual' as const, percentual: p })
  }
  if (e.tipo === 'valor') {
    const c = e.centavos
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > DESCONTO_MAXIMO_CENTAVOS) return null
    return comAte({ tipo: 'valor' as const, centavos: c })
  }
  return null
}

/**
 * O que vem da tela do sistema: estrito. `null` = preço normal (tira a
 * condição). O fim, se houver, não pode estar no passado (hoje vale).
 */
export function normalizarCondicao(entrada: unknown, hoje: string):
  { ok: true; condicao: Condicao | null } | { ok: false; error: string } {
  if (entrada == null) return { ok: true, condicao: null }
  if (typeof entrada !== 'object' || Array.isArray(entrada)) return { ok: false, error: 'Condição inválida.' }
  const e = entrada as Record<string, unknown>
  if (e.ate != null && e.ate !== '' && (typeof e.ate !== 'string' || !dataValida(e.ate))) return { ok: false, error: 'Data de fim inválida.' }
  if (typeof e.ate === 'string' && e.ate && e.ate < hoje) return { ok: false, error: 'A data de fim já passou.' }
  const c = montar(e)
  if (!c) {
    return { ok: false, error: e.tipo === 'percentual' ? 'Desconto de 1% a 100%.'
      : e.tipo === 'valor' ? 'Desconto em reais inválido.' : 'Condição inválida.' }
  }
  return { ok: true, condicao: c }
}

/** O gravado no banco: tolerante — o inválido some. */
export function lerCondicoes(gravado: unknown): Condicoes {
  if (!gravado || typeof gravado !== 'object' || Array.isArray(gravado)) return {}
  const g = gravado as Record<string, unknown>
  const saida: Condicoes = {}
  for (const item of ITENS_DA_ASSINATURA) {
    const e = g[item]
    if (!e || typeof e !== 'object') continue
    const ate = (e as { ate?: unknown }).ate
    if (ate != null && (typeof ate !== 'string' || !dataValida(ate))) continue
    const c = montar(e as Record<string, unknown>)
    if (c) saida[item] = c
  }
  return saida
}

/** O preço do item depois da condição. O desconto percentual arredonda ao centavo. */
export function valorComCondicao(bruto: number, c: Condicao | undefined): number {
  if (!c) return bruto
  if (c.tipo === 'cortesia') return 0
  if (c.tipo === 'percentual') return bruto - Math.round((bruto * c.percentual) / 100)
  return Math.max(0, bruto - c.centavos)
}

/** O preço cheio de cada item que a rede tem: o plano (a base) e cada adicional contratado. */
export function brutoDosItens(valorCentavos: number, adicionais: AdicionaisContratados): Partial<Record<ItemDaAssinatura, number>> {
  const itens: Partial<Record<ItemDaAssinatura, number>> = { plano: valorCentavos }
  if (adicionais.whatsapp) itens.whatsapp = adicionais.whatsapp.quantidade * adicionais.whatsapp.valor_centavos
  if (adicionais.copilot) itens.copilot = adicionais.copilot.quantidade * adicionais.copilot.valor_centavos
  return itens
}

/** A mensalidade: cada item com a condição dele, somados. É o que o Asaas cobra. */
export function totalComCondicoes(valorCentavos: number, adicionais: AdicionaisContratados, condicoes: Condicoes): number {
  const itens = brutoDosItens(valorCentavos, adicionais)
  return ITENS_DA_ASSINATURA.reduce((soma, item) => soma + (itens[item] != null ? valorComCondicao(itens[item]!, condicoes[item]) : 0), 0)
}

/**
 * Rede de cortesia: NADA A PAGAR (a rede tem plano — quem chama confere) —
 * seja por cortesia, por 100% de desconto, por desconto do tamanho do preço ou
 * por preço zero. Fica ativa, com a cobrança pausada (`cobranca: 'cortesia'`),
 * e as regras de atraso não a movem (verificação de 2026-10-07).
 */
export function ehCortesiaTotal(valorCentavos: number, adicionais: AdicionaisContratados, condicoes: Condicoes): boolean {
  return totalComCondicoes(valorCentavos, adicionais, condicoes) === 0
}

const dia = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

/** "Cortesia do BellarisOS até 31/12/2026", "20% de desconto", "R$ 50,00 de desconto". */
export function descreverCondicao(c: Condicao): string {
  const base = c.tipo === 'cortesia' ? 'Cortesia do BellarisOS'
    : c.tipo === 'percentual' ? `${c.percentual}% de desconto`
    : `${reaisDe(c.centavos)} de desconto`
  return c.ate ? `${base} até ${dia(c.ate)}` : base
}

/** Os itens cuja condição terminou ANTES de hoje (o dia do fim ainda vale). */
export function condicoesVencidas(condicoes: Condicoes, hoje: string): ItemDaAssinatura[] {
  return ITENS_DA_ASSINATURA.filter(item => !!condicoes[item]?.ate && condicoes[item]!.ate! < hoje)
}
