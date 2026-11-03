import { z } from 'zod'
import { PRAZO_MAXIMO_DA_OPERADORA, TETO_DE_VEZES } from './vezes-do-cartao'

/**
 * A BANDEIRA do cartão (r3-f13-01; o Heitor, 2026-11-03: "Lembre-se,
 * flexibilidade. Prazo por bandeira. Taxas também configuráveis por
 * bandeira.").
 *
 * - A configuração de antes (as taxas de `payment_fees` e o prazo de
 *   `tenants.cartao_prazo_dias`) é a REGRA GERAL: vale para toda bandeira sem
 *   regra própria e para o pagamento sem bandeira.
 * - Cada bandeira pode ter o seu prazo e as suas taxas
 *   (`tenants.cartao_por_bandeira`); o que falta cai na geral.
 * - O pagamento no cartão (crédito e débito) guarda a bandeira, opcional
 *   (`financial_transactions.cartao_bandeira`).
 * As contas moram no banco (`private.comissao_taxa_pct` com a bandeira,
 * `private.prazo_da_operadora`); aqui ficam a lista, os nomes e a leitura do
 * que chega da tela.
 */

export const BANDEIRAS = [
  { value: 'VISA',       label: 'Visa' },
  { value: 'MASTERCARD', label: 'Mastercard' },
  { value: 'ELO',        label: 'Elo' },
  { value: 'AMEX',       label: 'Amex' },
  { value: 'HIPERCARD',  label: 'Hipercard' },
  { value: 'OUTRAS',     label: 'Outras' },
] as const

export type Bandeira = (typeof BANDEIRAS)[number]['value']
const VALORES = BANDEIRAS.map(b => b.value) as [Bandeira, ...Bandeira[]]

export const ehBandeira = (v: unknown): v is Bandeira => typeof v === 'string' && (VALORES as string[]).includes(v)
export const rotuloDaBandeira = (v: string | null | undefined): string | null =>
  BANDEIRAS.find(b => b.value === v)?.label ?? null

/** Só o cartão tem bandeira. */
export const temBandeira = (metodo: string | null | undefined) => metodo === 'CREDIT_CARD' || metodo === 'DEBIT_CARD'

/** A bandeira do pagamento, como o banco grava: só no cartão, e só uma das seis. */
export function bandeiraDoPagamento(metodo: string | null | undefined, bandeira: unknown): Bandeira | null {
  return temBandeira(metodo) && ehBandeira(bandeira) ? bandeira : null
}

/** A chave de uma taxa no JSON da bandeira: "CREDIT_CARD:3", "DEBIT_CARD:1". */
export const chaveDaTaxa = (metodo: 'DEBIT_CARD' | 'CREDIT_CARD', parcelas: number) => `${metodo}:${parcelas}`

/** O que a clínica guarda de cada bandeira — o que falta é a regra geral. */
export interface RegraDaBandeira {
  prazo?: number
  /** "CREDIT_CARD:3" → 3 (%). Pix não tem bandeira. */
  taxas: Record<string, number>
}
export type CartaoPorBandeira = Partial<Record<Bandeira, RegraDaBandeira>>

const CHAVE_DA_TAXA = /^(DEBIT_CARD:1|CREDIT_CARD:([1-9]|1[0-2]))$/

/** A entrada do "Salvar taxas" da bandeira, conferida no servidor. */
export const EntradaDoCartaoPorBandeira = z.record(z.string(), z.object({
  prazo: z.number().int().min(1, `O prazo da operadora vai de 1 a ${PRAZO_MAXIMO_DA_OPERADORA} dias.`)
    .max(PRAZO_MAXIMO_DA_OPERADORA, `O prazo da operadora vai de 1 a ${PRAZO_MAXIMO_DA_OPERADORA} dias.`).optional(),
  taxas: z.record(z.string(), z.number().min(0, 'Use percentuais entre 0 e 100.').max(100, 'Use percentuais entre 0 e 100.')),
})).superRefine((obj, c) => {
  for (const [bandeira, regra] of Object.entries(obj)) {
    if (!ehBandeira(bandeira)) c.addIssue({ code: 'custom', message: `Bandeira desconhecida: ${bandeira}.` })
    for (const chave of Object.keys(regra.taxas)) {
      if (!CHAVE_DA_TAXA.test(chave)) c.addIssue({ code: 'custom', message: `Taxa desconhecida na bandeira ${bandeira}: ${chave} (débito, ou crédito de 1 a ${TETO_DE_VEZES}x).` })
    }
  }
})

/** O que se grava: sem as bandeiras vazias (sem prazo nem taxa, é a regra geral). */
export function semBandeirasVazias(c: CartaoPorBandeira): CartaoPorBandeira {
  const saida: CartaoPorBandeira = {}
  for (const b of VALORES) {
    const r = c[b]
    if (!r) continue
    const taxas = Object.fromEntries(Object.entries(r.taxas ?? {}).filter(([, v]) => Number.isFinite(v)))
    if (r.prazo == null && !Object.keys(taxas).length) continue
    saida[b] = { ...(r.prazo != null ? { prazo: r.prazo } : {}), taxas }
  }
  return saida
}

/** Lê o que veio do banco (jsonb), sem confiar no formato. */
export function lerCartaoPorBandeira(bruto: unknown): CartaoPorBandeira {
  const saida: CartaoPorBandeira = {}
  if (!bruto || typeof bruto !== 'object') return saida
  for (const [b, r] of Object.entries(bruto as Record<string, unknown>)) {
    if (!ehBandeira(b) || !r || typeof r !== 'object') continue
    const regra = r as { prazo?: unknown; taxas?: unknown }
    const taxas: Record<string, number> = {}
    if (regra.taxas && typeof regra.taxas === 'object') {
      for (const [k, v] of Object.entries(regra.taxas as Record<string, unknown>)) if (CHAVE_DA_TAXA.test(k) && typeof v === 'number') taxas[k] = v
    }
    saida[b] = { ...(typeof regra.prazo === 'number' ? { prazo: regra.prazo } : {}), taxas }
  }
  return saida
}
