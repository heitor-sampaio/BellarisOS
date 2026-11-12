import { z } from 'zod'
import { lerCartaoPorBandeira, EntradaDoCartaoPorBandeira, semBandeirasVazias, type CartaoPorBandeira, type RegraDaBandeira } from './bandeiras'
import { maximoDeVezes, PRAZO_PADRAO_DA_OPERADORA, PRAZO_MAXIMO_DA_OPERADORA, TAXA_MAXIMA_DO_REGISTRO, TETO_DE_VEZES } from './vezes-do-cartao'

/**
 * As MAQUININHAS da rede (C75 do levantamento das regras, F67 — o Heitor: "Quem
 * escolhe a taxa é a operadora: stone, mercadopago, elo e por ai vai… a rede
 * precisa configurar suas taxas, por operadora").
 *
 * Cada uma tem o nome, as taxas (débito e crédito de 1x a 12x, as chaves
 * "DEBIT_CARD:1" e "CREDIT_CARD:N"), até quantas vezes parcela, o prazo de cada
 * parcela e a opção fechada "cobra diferente em alguma bandeira?". O Pix tem
 * campo próprio (`tenants.pix_taxa_pct`).
 *
 * A venda no cartão guarda a maquininha (`financial_transactions.maquininha_id`);
 * sem escolha, o banco põe a PRIMEIRA ativa (`private.maquininha_do_lancamento`).
 * As contas da taxa e do prazo moram no banco (`private.taxa_da_maquininha`,
 * `private.prazo_da_operadora`); aqui, a leitura e o espelho para a tela.
 *
 * Puro (sem banco): a leitura da rede mora em `maquininhas-da-rede.ts`.
 */

export interface Maquininha {
  id:               string
  nome:             string
  ordem:            number
  /** "CREDIT_CARD:3" → 3 (%). O que falta não tem taxa (vale 0% — F16-2). */
  taxas:            Record<string, number>
  /** Até quantas vezes; nulo = a maior parcela do crédito com taxa (D-15). */
  maxVezes:         number | null
  prazoDias:        number
  cobraPorBandeira: boolean
  porBandeira:      CartaoPorBandeira
  arquivada:        boolean
}

const CHAVE_DA_TAXA = /^(DEBIT_CARD:1|CREDIT_CARD:([1-9]|1[0-2]))$/

/** Lê a linha do banco, sem confiar no formato do JSON. */
export function lerMaquininha(l: Record<string, unknown>): Maquininha {
  const taxas: Record<string, number> = {}
  const bruto = l.taxas
  if (bruto && typeof bruto === 'object') {
    for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
      if (CHAVE_DA_TAXA.test(k) && Number.isFinite(n)) taxas[k] = n
    }
  }
  return {
    id: String(l.id), nome: String(l.nome ?? 'Maquininha'), ordem: Number(l.ordem ?? 0),
    taxas,
    maxVezes: l.max_vezes == null ? null : Number(l.max_vezes),
    prazoDias: Number(l.prazo_dias ?? PRAZO_PADRAO_DA_OPERADORA),
    cobraPorBandeira: l.cobra_por_bandeira === true,
    porBandeira: lerCartaoPorBandeira(l.por_bandeira),
    arquivada: l.arquivada_em != null,
  }
}

/** As vezes do crédito com taxa cadastrada nesta maquininha. */
export function parcelasComTaxa(m: Pick<Maquininha, 'taxas'>): number[] {
  return Object.keys(m.taxas).filter(k => k.startsWith('CREDIT_CARD:')).map(k => Number(k.split(':')[1]))
}

/** Até quantas vezes esta maquininha parcela (D-15). */
export function maximoDaMaquininha(m: Pick<Maquininha, 'taxas' | 'maxVezes'>): number {
  return maximoDeVezes(m.maxVezes, parcelasComTaxa(m))
}

/**
 * A maquininha que vale na venda: a escolhida (se é da lista), senão a
 * primeira ativa — a mesma que o banco põe no lançamento sem escolha.
 */
export function maquininhaDaVenda<T extends Pick<Maquininha, 'id' | 'arquivada'>>(lista: T[], escolhida: string | null | undefined): T | null {
  if (escolhida) {
    const achou = lista.find(m => m.id === escolhida)
    if (achou) return achou
  }
  return lista.find(m => !m.arquivada) ?? lista[0] ?? null
}

/** As ativas, na ordem da tela. */
export function ativas<T extends Pick<Maquininha, 'arquivada'>>(lista: T[]): T[] {
  return lista.filter(m => !m.arquivada)
}

/** A taxa que vale nesta maquininha (o espelho de `private.taxa_da_maquininha`), ou nula. */
export function taxaNaMaquininha(
  m: Pick<Maquininha, 'taxas' | 'cobraPorBandeira' | 'porBandeira'>, metodo: 'DEBIT_CARD' | 'CREDIT_CARD', vezes: number, bandeira?: string | null,
): { taxa: number | null; daBandeira: boolean } {
  const chave = metodo === 'DEBIT_CARD' ? 'DEBIT_CARD:1' : `CREDIT_CARD:${Math.max(1, Math.min(TETO_DE_VEZES, Math.trunc(vezes || 1)))}`
  const regra: RegraDaBandeira | undefined = m.cobraPorBandeira && bandeira ? m.porBandeira[bandeira as keyof CartaoPorBandeira] : undefined
  const daBandeira = regra?.taxas[chave]
  if (typeof daBandeira === 'number' && Number.isFinite(daBandeira)) return { taxa: daBandeira, daBandeira: true }
  const geral = m.taxas[chave]
  return { taxa: typeof geral === 'number' && Number.isFinite(geral) ? geral : null, daBandeira: false }
}

/** O id de uma maquininha como chega da tela (o banco confere a rede). */
export const ID_DA_MAQUININHA = z.string().regex(/^[0-9a-f-]{36}$/i, 'Maquininha inválida.')

const TAXA = z.number().min(0, 'A taxa não pode ser negativa.').max(TAXA_MAXIMA_DO_REGISTRO, 'A taxa vai até 999,99% (o limite do registro).')

/** O que o "Salvar" de uma maquininha manda, conferido no servidor. */
export const EntradaDaMaquininha = z.object({
  id: ID_DA_MAQUININHA.nullable().optional(),
  nome: z.string().trim().min(1, 'Dê um nome à maquininha (ex.: Stone).').max(60, 'O nome vai até 60 letras.'),
  taxas: z.record(z.string(), TAXA).superRefine((obj, c) => {
    for (const k of Object.keys(obj)) if (!CHAVE_DA_TAXA.test(k)) c.addIssue({ code: 'custom', message: `Taxa desconhecida: ${k}.` })
  }),
  maxVezes: z.number().int().min(1, `Parcelar até: de 1 a ${TETO_DE_VEZES}x.`).max(TETO_DE_VEZES, `Parcelar até: de 1 a ${TETO_DE_VEZES}x.`).nullable(),
  prazoDias: z.number().int().min(1, `O prazo da operadora vai de 1 a ${PRAZO_MAXIMO_DA_OPERADORA} dias.`)
    .max(PRAZO_MAXIMO_DA_OPERADORA, `O prazo da operadora vai de 1 a ${PRAZO_MAXIMO_DA_OPERADORA} dias.`),
  cobraPorBandeira: z.boolean(),
  porBandeira: EntradaDoCartaoPorBandeira,
})
export type EntradaDaMaquininha = z.infer<typeof EntradaDaMaquininha>

/** A linha que se grava (sem as bandeiras vazias). */
export function linhaDaMaquininha(e: EntradaDaMaquininha) {
  return {
    nome: e.nome.trim(),
    taxas: e.taxas,
    max_vezes: e.maxVezes,
    prazo_dias: e.prazoDias,
    cobra_por_bandeira: e.cobraPorBandeira,
    por_bandeira: semBandeirasVazias(e.porBandeira as CartaoPorBandeira),
  }
}
