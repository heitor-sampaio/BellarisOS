import { z } from 'zod'
import { PRAZO_MAXIMO_DA_OPERADORA, TAXA_MAXIMA_DO_REGISTRO, TETO_DE_VEZES } from './vezes-do-cartao'
import { taxaQueVale } from './formas'

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
  // F16-3: sem teto — só não negativa (e o limite do registro).
  taxas: z.record(z.string(), z.number().min(0, 'A taxa não pode ser negativa.')
    .max(TAXA_MAXIMA_DO_REGISTRO, 'A taxa vai até 999,99% (o limite do registro).')),
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

/**
 * A taxa do crédito em N vezes numa bandeira — o espelho, para a tela, de
 * `private.comissao_taxa_pct` com a bandeira (r4-f15-01; o Heitor, revisão das
 * decisões da F15: o campo vazio da bandeira é a regra geral). A da bandeira só
 * vale com a taxa EXATA daquelas vezes; senão vale a regra geral daquelas vezes
 * (`taxaQueVale`, também só a exata); sem nenhuma das duas, 0% (F16-2). Sem
 * herdar faixa: a Elo só com o 3x não dá a sua taxa ao 5x, nem o 3x da geral
 * ao 4x.
 */
export function taxaDoCreditoNaBandeira(
  geral: { parcelas: number; taxa_pct: number }[], regra: Pick<RegraDaBandeira, 'taxas'> | undefined, vezes: number,
): { cadastrada: boolean; daBandeira: boolean; parcelas: number | null; taxa: number } {
  const daBandeira = regra?.taxas[chaveDaTaxa('CREDIT_CARD', vezes)]
  if (typeof daBandeira === 'number' && Number.isFinite(daBandeira)) return { cadastrada: true, daBandeira: true, parcelas: vezes, taxa: daBandeira }
  return { ...taxaQueVale(geral, vezes), daBandeira: false }
}

/**
 * "Preencher pela taxa por parcela" (r4-f15-01; o Heitor: "a taxa é por
 * parcela, por exemplo 1.15% por parcela, então a taxa total é a taxa vezes a
 * quantidade de parcelas"): o crédito de 1x a 12x = a taxa × as vezes, em duas
 * casas. Só preenche a tabela da tela; a tabela continua sendo a verdade.
 */
export function creditoPelaTaxaPorParcela(taxaPorParcela: number): { parcelas: number; taxa: number }[] {
  return Array.from({ length: TETO_DE_VEZES }, (_, i) => {
    const parcelas = i + 1
    return { parcelas, taxa: Math.round(Number((taxaPorParcela * parcelas).toPrecision(12)) * 100) / 100 }
  })
}

/**
 * "de 3,1 a 11,9" digitado na taxa por parcela (A4 da 9ª simulação,
 * 2026-11-07): é a FAIXA da tabela da operadora — o 1x e a última vez —, não
 * uma taxa por parcela. As pontas, ou nulo. O meio não se inventa (princípio
 * 4): a tela leva ao "Colar a tabela" com o 1x e a última, e a clínica cola
 * (ou digita) o resto.
 */
export function faixaDaOperadora(texto: string): { de: number; ate: number } | null {
  const m = texto.trim().match(/^(?:de\s+)?(\d+(?:[.,]\d+)?)\s*%?\s*(?:a|até|ate|-|–)\s*(\d+(?:[.,]\d+)?)\s*%?$/i)
  if (!m) return null
  const n = (s: string) => Number(s.replace(',', '.'))
  const de = n(m[1]!), ate = n(m[2]!)
  return Number.isFinite(de) && Number.isFinite(ate) && de >= 0 && ate >= 0 ? { de, ate } : null
}

/**
 * "Colar a tabela da operadora" (A3 da 7ª simulação, 2026-11-05; decidido pelo
 * princípio 3): o "Preencher pela taxa por parcela" multiplica (a regra do
 * Heitor) e a tabela real não é assim — 2,99% à vista e 6,50% em 6x. A tela
 * lê a tabela copiada da operadora (ou de uma planilha) e preenche cada vez
 * com a taxa DELA, mostrando antes o que vai preencher. Só a leitura; a tabela
 * da tela continua sendo a verdade e grava no "Salvar taxas".
 *
 * - "6x 6,50%", "6x\t6,50", "Crédito 6x: 6,50", "6 vezes 6.5": a vez e a taxa;
 * - só números ("2,99", "2,99; 4,09"): as vezes em ordem, a partir do 1x;
 * - linha do débito ou do Pix fica de fora (têm campo próprio), e a leitura diz;
 * - linha sem número (o cabeçalho) é pulada; o que não se entende é ERRO, sem
 *   chutar (princípio 4).
 */
export function taxasDaTabelaColada(texto: string): {
  taxas: { parcelas: number; taxa: number }[]; ignoradas: string[]; erros: string[]
} {
  const lidas = new Map<number, number>()
  const ignoradas: string[] = []
  const erros: string[] = []
  const numero = (t: string): number => {
    const limpo = t.replace(/%/g, '').trim()
    if (!/^-?\d/.test(limpo)) return NaN
    const n = Number(limpo.replace(/\./g, limpo.includes(',') ? '' : '.').replace(',', '.'))
    return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : NaN
  }
  let proxima = 1
  const guardar = (vezes: number, taxa: number, linha: string) => {
    if (!Number.isFinite(taxa)) { erros.push(`Não entendi a taxa em "${linha}".`); return }
    if (taxa < 0) { erros.push(`Em ${vezes}x a taxa está negativa ("${linha}").`); return }
    if (vezes < 1 || vezes > TETO_DE_VEZES) { erros.push(`${vezes}x: o crédito vai de 1x a ${TETO_DE_VEZES}x ("${linha}").`); return }
    if (lidas.has(vezes)) { erros.push(`${vezes}x aparece duas vezes na tabela.`); return }
    lidas.set(vezes, taxa)
  }
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha || !/\d/.test(linha)) continue
    if (/d[ée]bito|\bpix\b/i.test(linha)) { ignoradas.push(linha); continue }
    const comVezes = linha.match(/(\d{1,2})\s*(?:x|vezes|vez|parcelas?)(?![a-z])(.*)$/i)
    if (comVezes) {
      const vezes = Number(comVezes[1])
      const taxa = comVezes[2]!.match(/-?\d[\d.,]*/)
      if (!taxa) { erros.push(`Não entendi a linha "${linha}": falta a taxa.`); continue }
      guardar(vezes, numero(taxa[0]), linha)
      proxima = vezes + 1
      continue
    }
    for (const parte of linha.split(/[\s;|]+/).filter(Boolean)) {
      guardar(proxima, numero(parte), linha)
      proxima++
    }
  }
  const taxas = [...lidas.entries()].sort((a, b) => a[0] - b[0]).map(([parcelas, taxa]) => ({ parcelas, taxa }))
  return { taxas, ignoradas, erros }
}

/**
 * A taxa do crédito que BAIXA com mais vezes (A2 da 8ª simulação, 2026-11-06;
 * decidido pelo princípio 2 — "no máximo, avisar"): o "Preencher pela taxa por
 * parcela" deixou 1x 2,80% e 2x 1,98%, e a tabela salvou calada. A operadora
 * costuma cobrar mais em mais vezes; a tela grava o que a clínica escolheu e
 * diz o que parece engano. Nulo = nada a avisar. Só as vezes preenchidas.
 */
export function avisoDaTaxaQueBaixa(taxas: { parcelas: number; taxa: number }[]): string | null {
  const ordem = [...taxas].filter(t => Number.isFinite(t.taxa)).sort((a, b) => a.parcelas - b.parcelas)
  const pct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false })
  const nome = (n: number) => (n === 1 ? 'o crédito à vista' : `${n}x`)
  for (let i = 1; i < ordem.length; i++) {
    const antes = ordem[i - 1]!, agora = ordem[i]!
    if (agora.taxa < antes.taxa) {
      return `${agora.parcelas}x (${pct(agora.taxa)}%) sai mais barato que ${nome(antes.parcelas)} (${pct(antes.taxa)}%). A operadora costuma cobrar mais em mais vezes: confira a tabela. Ficou salvo como está.`
    }
  }
  return null
}
