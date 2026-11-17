import { formatBRL } from '@estetica-os/utils'
import { MAXIMO_DE_OUTRAS, valorDaParte, valorDaPrincipal, type EstadoDaParte } from '@/lib/checkout/varias-formas'

/**
 * O "Receber" do a receber e da parcela do crediário em mais de uma forma (A1
 * da 21ª simulação; a decisão de 16/11, "+ Outra forma" em todo Receber à
 * vista): a parcela de R$ 600 recebida com R$ 400 no Pix e R$ 200 no cartão.
 * Um lançamento pago por forma, numa transação (`lancamento_receber_em_formas`).
 *
 * Puro: a janela, a action e o teste usam a mesma conta.
 */
export interface ParteDaBaixa {
  forma:       string
  valor:       number
  bandeira?:   string | null
  vezes?:      number | null
  maquininha?: string | null
}

/** As formas de quem recebe agora (as da baixa). */
export const FORMAS_DA_BAIXA_EM_PARTES = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const

const centavos = (v: number) => Math.round(v * 100)

/** A recusa das partes, ou nulo: cada uma com forma e valor, e a soma fechando o valor do lançamento. */
export function recusaDasFormasDaBaixa(partes: readonly ParteDaBaixa[], valor: number): string | null {
  if (partes.length > MAXIMO_DE_OUTRAS + 1) return `Divida em até ${MAXIMO_DE_OUTRAS + 1} formas.`
  if (partes.some(p => !(FORMAS_DA_BAIXA_EM_PARTES as readonly string[]).includes(p.forma))) return 'Escolha a forma de cada parte.'
  if (partes.some(p => !(typeof p.valor === 'number' && Number.isFinite(p.valor) && centavos(p.valor) > 0))) return 'Digite o valor de cada forma (acima de zero).'
  if (partes.some(p => p.vezes != null && p.vezes > 1 && p.forma !== 'CREDIT_CARD')) return 'As vezes no cartão são só no crédito (o débito é 1x).'
  const soma = partes.reduce((s, p) => s + centavos(p.valor), 0)
  if (soma !== centavos(valor)) return `As formas somam ${formatBRL(soma / 100)} e não fecham o valor de ${formatBRL(valor)}.`
  return null
}

const comCartao = (forma: string) => forma === 'CREDIT_CARD' || forma === 'DEBIT_CARD'

/**
 * A janela → as partes: a primeira forma (a de cima) fica com o que falta das
 * outras; cada outra, com o valor dela. A bandeira e a maquininha só no cartão.
 */
export function partesDaBaixa(
  principal: { forma: string; bandeira: string | null; vezes: number; maquininha: string | null },
  valor: number, outras: readonly EstadoDaParte[],
): ParteDaBaixa[] {
  return [
    {
      forma: principal.forma, valor: valorDaPrincipal(valor, [...outras]),
      bandeira: comCartao(principal.forma) ? principal.bandeira || null : null,
      vezes: principal.forma === 'CREDIT_CARD' ? principal.vezes : 1,
      maquininha: comCartao(principal.forma) ? principal.maquininha || null : null,
    },
    ...outras.map(o => ({
      forma: o.metodo, valor: valorDaParte(o) ?? 0,
      bandeira: comCartao(o.metodo) ? o.bandeira || null : null,
      vezes: o.metodo === 'CREDIT_CARD' ? o.vezes : 1,
      maquininha: comCartao(o.metodo) ? o.maquininha || null : null,
    })),
  ]
}

/** O que chega do navegador → as partes (ou a recusa). Nada além do formato: o resto é `recusaDasFormasDaBaixa`. */
export function lerPartesDaBaixa(bruto: unknown): ParteDaBaixa[] | { error: string } {
  if (!Array.isArray(bruto) || bruto.length > MAXIMO_DE_OUTRAS + 1) return { error: 'Formas inválidas.' }
  const partes: ParteDaBaixa[] = []
  for (const p of bruto as unknown[]) {
    if (!p || typeof p !== 'object') return { error: 'Formas inválidas.' }
    const { forma, valor, bandeira = null, vezes = null, maquininha = null } = p as Record<string, unknown>
    if (typeof forma !== 'string' || typeof valor !== 'number') return { error: 'Formas inválidas.' }
    if (bandeira != null && typeof bandeira !== 'string') return { error: 'Bandeira inválida.' }
    if (vezes != null && (typeof vezes !== 'number' || !Number.isInteger(vezes))) return { error: 'Vezes inválidas.' }
    if (maquininha != null && (typeof maquininha !== 'string' || !/^[0-9a-f-]{36}$/i.test(maquininha))) return { error: 'Maquininha inválida.' }
    partes.push({ forma, valor, bandeira: bandeira as string | null, vezes: vezes as number | null, maquininha: maquininha as string | null })
  }
  return partes
}
