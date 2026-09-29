import { z } from 'zod'

/**
 * A configuração de comissões da REDE (Configurações → Comissões) e as taxas
 * da maquininha — decisões do Heitor de 2026-09-30. Puro: a tela e o servidor
 * leem as mesmas definições.
 */

export const MODOS = ['ATENDIMENTO', 'PAGAMENTO'] as const
export const PERIODOS = ['MENSAL', 'QUINZENAL', 'SEMANAL'] as const
export const BASES_COM_PONTOS = ['PRECO', 'VALOR_PAGO'] as const

export type ModoDaComissao = typeof MODOS[number]
export type PeriodoDaComissao = typeof PERIODOS[number]
export type BaseComPontos = typeof BASES_COM_PONTOS[number]

export interface ConfigDeComissao {
  modo:             ModoDaComissao
  desconta_insumos: boolean
  desconta_taxa:    boolean
  base_com_pontos:  BaseComPontos
  periodo:          PeriodoDaComissao
}

export const CONFIG_PADRAO: ConfigDeComissao = {
  modo: 'ATENDIMENTO', desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL',
}

export const EntradaDaConfigDeComissao = z.object({
  modo:             z.enum(MODOS),
  desconta_insumos: z.boolean(),
  desconta_taxa:    z.boolean(),
  base_com_pontos:  z.enum(BASES_COM_PONTOS),
  periodo:          z.enum(PERIODOS),
})

/** Uma linha do banco (ou nenhuma) → a configuração, com os padrões no que faltar. */
export function configDaLinha(linha: Partial<Record<keyof ConfigDeComissao, unknown>> | null | undefined): ConfigDeComissao {
  const l = linha ?? {}
  return {
    modo:             l.modo === 'PAGAMENTO' ? 'PAGAMENTO' : 'ATENDIMENTO',
    desconta_insumos: l.desconta_insumos === true,
    desconta_taxa:    l.desconta_taxa === true,
    base_com_pontos:  l.base_com_pontos === 'VALOR_PAGO' ? 'VALOR_PAGO' : 'PRECO',
    periodo:          l.periodo === 'QUINZENAL' || l.periodo === 'SEMANAL' ? l.periodo : 'MENSAL',
  }
}

// ─── Taxas da maquininha ─────────────────────────────────────────────────────

export const METODOS_COM_TAXA = ['PIX', 'DEBIT_CARD', 'CREDIT_CARD'] as const
export type MetodoComTaxa = typeof METODOS_COM_TAXA[number]

export interface TaxaDePagamento { metodo: MetodoComTaxa; parcelas: number; taxa_pct: number }

export const EntradaDasTaxas = z.array(z.object({
  metodo:   z.enum(METODOS_COM_TAXA),
  parcelas: z.number().int().min(1).max(12),
  taxa_pct: z.number().min(0).max(100),
})).max(20).refine(
  lista => lista.every(t => t.metodo === 'CREDIT_CARD' || t.parcelas === 1),
  'Só o crédito tem taxa por número de parcelas.',
).refine(
  lista => new Set(lista.map(t => `${t.metodo}/${t.parcelas}`)).size === lista.length,
  'Há taxa repetida para o mesmo meio e parcelas.',
)

/**
 * A taxa de um recebimento: a do meio e das parcelas; sem a do número exato de
 * parcelas no crédito, a da maior quantidade cadastrada abaixo dele (e, sem
 * nenhuma, a do crédito à vista). Meio sem taxa (dinheiro, crédito interno): 0.
 */
export function taxaDoRecebimento(taxas: TaxaDePagamento[], metodo: string | null, parcelas = 1): number {
  const doMeio = taxas.filter(t => t.metodo === metodo)
  if (!doMeio.length) return 0
  if (metodo !== 'CREDIT_CARD') return doMeio[0]!.taxa_pct
  const n = Math.max(1, Math.min(12, Math.trunc(parcelas)))
  const candidata = doMeio.filter(t => t.parcelas <= n).sort((a, b) => b.parcelas - a.parcelas)[0]
  return candidata?.taxa_pct ?? 0
}

// ─── Regras por profissional ─────────────────────────────────────────────────

export type TipoDeRegra = 'PERCENTAGE' | 'FIXED_AMOUNT'

export interface RegraDeComissao {
  procedure_id: string | null
  tipo:         TipoDeRegra
  valor:        number
}

const Regra = z.object({
  tipo:  z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  valor: z.number().min(0).max(1_000_000),
}).refine(r => r.tipo !== 'PERCENTAGE' || r.valor <= 100, 'Percentual acima de 100%.')

export const EntradaDasRegras = z.object({
  padrao:   Regra.nullable(),
  excecoes: z.array(Regra.and(z.object({ procedure_id: z.string().uuid() }))).max(200)
    .refine(l => new Set(l.map(e => e.procedure_id)).size === l.length, 'Há duas exceções para o mesmo procedimento.'),
})

/**
 * A regra que vale para um procedimento: a exceção dele; senão, o padrão do
 * profissional; sem nenhuma, nulo (e o atendimento não gera comissão — a
 * tela avisa quem atende e não tem regra).
 */
export function regraAplicavel(regras: RegraDeComissao[], procedureId: string | null): RegraDeComissao | null {
  return (procedureId ? regras.find(r => r.procedure_id === procedureId) : undefined)
    ?? regras.find(r => r.procedure_id === null)
    ?? null
}

/** O valor da comissão de uma regra sobre uma base, em centavos exatos. */
export function valorDaRegra(regra: Pick<RegraDeComissao, 'tipo' | 'valor'>, base: number): number {
  const v = regra.tipo === 'PERCENTAGE' ? base * regra.valor / 100 : regra.valor
  return Math.round(v * 100) / 100
}

export function rotuloDaRegra(regra: Pick<RegraDeComissao, 'tipo' | 'valor'> | null): string {
  if (!regra) return 'Sem comissão'
  return regra.tipo === 'PERCENTAGE'
    ? `${String(regra.valor).replace('.', ',')}%`
    : `R$ ${regra.valor.toFixed(2).replace('.', ',')} fixo`
}
