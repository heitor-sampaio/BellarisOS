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
  /**
   * A comissão da VENDA DE PRODUTO (D4, 2026-10-30): % do vendido para quem
   * vendeu, liberada quando a venda é paga. Nulo = sem comissão.
   */
  produto_pct:      number | null
}

export const CONFIG_PADRAO: ConfigDeComissao = {
  modo: 'ATENDIMENTO', desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL',
  produto_pct: null,
}

export const EntradaDaConfigDeComissao = z.object({
  modo:             z.enum(MODOS),
  desconta_insumos: z.boolean(),
  desconta_taxa:    z.boolean(),
  base_com_pontos:  z.enum(BASES_COM_PONTOS),
  periodo:          z.enum(PERIODOS),
  // Sem o campo (um chamador antigo), sem comissão de produto.
  produto_pct:      z.number().min(0, 'A comissão não pode ser negativa.').max(100, 'A comissão é de no máximo 100%.').nullable().optional().default(null),
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
    produto_pct:      l.produto_pct == null || !(Number(l.produto_pct) > 0) ? null : Number(l.produto_pct),
  }
}

/**
 * O que sai da base da comissão, em palavras (J-46, 2026-10-30): a dona achou
 * que a comissão descontava taxa e insumo, e o padrão é a base CHEIA. A
 * configuração e o extrato dizem a mesma frase.
 */
export function rotuloDaBase(c: { desconta_taxa: boolean; desconta_insumos: boolean }): string {
  if (c.desconta_taxa && c.desconta_insumos) return 'base sem a taxa da maquininha e sem os insumos'
  if (c.desconta_taxa) return 'base sem a taxa da maquininha'
  if (c.desconta_insumos) return 'base sem o custo dos insumos'
  return 'base cheia (sem taxa nem insumo descontados)'
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

// A taxa de um recebimento (a do meio; no crédito, a da maior quantidade de
// parcelas cadastrada até a do recebimento) é conta do BANCO,
// `private.comissao_taxa_pct`: o recebimento do plano entra por gatilho e
// precisa dela. Uma cópia só.

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

// ─── A comissão do procedimento (2026-10-15) ────────────────────────────────

/** A comissão GERAL de um procedimento, a mesma para todos (`commission_rules`
 *  sem profissional), por id do procedimento. */
export type ComissoesGerais = ReadonlyMap<string, Pick<RegraDeComissao, 'tipo' | 'valor'>>

/**
 * A comissão de um procedimento, pelo procedimento: a mesma para todos OU um
 * valor para cada profissional (as exceções de sempre; quem fica sem valor
 * segue o padrão dele).
 */
export const EntradaDaComissaoDoProcedimento = z.discriminatedUnion('modo', [
  z.object({ modo: z.literal('GERAL'), geral: Regra }),
  z.object({
    modo: z.literal('POR_PROFISSIONAL'),
    profissionais: z.array(Regra.and(z.object({ professional_id: z.string().uuid() }))).max(500)
      .refine(l => new Set(l.map(e => e.professional_id)).size === l.length, 'Há dois valores para o mesmo profissional.'),
  }),
])

export function rotuloDaComissaoDoProcedimento(geral: Pick<RegraDeComissao, 'tipo' | 'valor'> | null, porProfissional: number): string {
  if (geral) return `${rotuloDaRegra(geral)} para todos`
  return porProfissional > 0 ? `Por profissional · ${porProfissional}` : 'Padrão de cada um'
}

/**
 * A regra que vale para um procedimento: a GERAL dele (a mesma para todos);
 * senão, a exceção do profissional; senão, o padrão do profissional; sem
 * nenhuma, nulo (e o atendimento não gera comissão — a tela avisa quem
 * atende e não tem regra).
 */
export function regraAplicavel(
  regras: RegraDeComissao[], procedureId: string | null, gerais: ComissoesGerais = new Map(),
): RegraDeComissao | null {
  const geral = procedureId ? gerais.get(procedureId) : undefined
  if (geral && procedureId) return { procedure_id: procedureId, tipo: geral.tipo, valor: geral.valor }
  return (procedureId ? regras.find(r => r.procedure_id === procedureId) : undefined)
    ?? regras.find(r => r.procedure_id === null)
    ?? null
}

// ─── A comissão do pacote (2026-10-30) ──────────────────────────────────────

/**
 * A comissão de um pacote, no cadastro dele (decisão do Heitor, 2026-10-30):
 * - de VENDA, para quem vendeu — % do vendido ou valor fixo, liberada à medida
 *   que o pacote é pago (a conta é do banco, `comissao_alvo`);
 * - de EXECUÇÃO, para quem atende cada sessão — a regra do profissional (o de
 *   sempre, e o padrão), % da parte da sessão, valor fixo por sessão ou nenhuma.
 */
export const EXECUCOES_DO_PACOTE = ['REGRA', 'PERCENTAGE', 'FIXED_AMOUNT', 'NENHUMA'] as const
export type ExecucaoDoPacote = typeof EXECUCOES_DO_PACOTE[number]

export interface ComissaoDoPacote {
  venda:    Pick<RegraDeComissao, 'tipo' | 'valor'> | null
  execucao: { tipo: ExecucaoDoPacote; valor: number | null }
}

export const COMISSAO_DO_PACOTE_PADRAO: ComissaoDoPacote = { venda: null, execucao: { tipo: 'REGRA', valor: null } }

export const EntradaDaComissaoDoPacote = z.object({
  venda:    Regra.nullable(),
  execucao: z.union([
    z.object({ tipo: z.enum(['REGRA', 'NENHUMA']), valor: z.null().optional().default(null) }),
    z.object({ tipo: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']), valor: z.number().min(0).max(1_000_000) })
      .refine(r => r.tipo !== 'PERCENTAGE' || r.valor <= 100, 'Percentual acima de 100%.'),
  ]),
})

/** As colunas do banco (`service_packages` ou o retrato em `client_packages`) → a comissão do pacote. */
export function comissaoDoPacoteDaLinha(l: {
  comissao_venda_tipo?: unknown; comissao_venda_valor?: unknown; comissao_execucao?: unknown; comissao_execucao_valor?: unknown
} | null | undefined): ComissaoDoPacote {
  const tipoV = l?.comissao_venda_tipo
  const venda = (tipoV === 'PERCENTAGE' || tipoV === 'FIXED_AMOUNT') && l?.comissao_venda_valor != null
    ? { tipo: tipoV as TipoDeRegra, valor: Number(l.comissao_venda_valor) } : null
  const tipoE = EXECUCOES_DO_PACOTE.includes(l?.comissao_execucao as ExecucaoDoPacote) ? l!.comissao_execucao as ExecucaoDoPacote : 'REGRA'
  const comValor = tipoE === 'PERCENTAGE' || tipoE === 'FIXED_AMOUNT'
  if (comValor && l?.comissao_execucao_valor == null) return { venda, execucao: { tipo: 'REGRA', valor: null } }
  return { venda, execucao: { tipo: tipoE, valor: comValor ? Number(l!.comissao_execucao_valor) : null } }
}

/** "Venda: 10% · Execução: R$ 25,00 fixo por sessão". */
export function rotuloDaComissaoDoPacote(c: ComissaoDoPacote): string {
  const venda = c.venda ? rotuloDaRegra(c.venda) : 'nenhuma'
  const e = c.execucao
  const execucao = e.tipo === 'REGRA' ? 'regra de cada profissional'
    : e.tipo === 'NENHUMA' ? 'nenhuma'
    : e.tipo === 'PERCENTAGE' ? `${rotuloDaRegra({ tipo: 'PERCENTAGE', valor: e.valor ?? 0 })} da sessão`
    : `${rotuloDaRegra({ tipo: 'FIXED_AMOUNT', valor: e.valor ?? 0 })} por sessão`
  return `Venda: ${venda} · Execução: ${execucao}`
}

/**
 * A regra da EXECUÇÃO de uma sessão de pacote: a do pacote, quando ele diz
 * uma; "nenhuma" é sem comissão (nulo); "regra do profissional", a de sempre.
 */
export function regraDaSessaoDePacote(
  execucao: ComissaoDoPacote['execucao'], regras: RegraDeComissao[], procedureId: string | null, gerais: ComissoesGerais = new Map(),
): RegraDeComissao | null {
  if (execucao.tipo === 'NENHUMA') return null
  if (execucao.tipo === 'REGRA' || execucao.valor == null) return regraAplicavel(regras, procedureId, gerais)
  return { procedure_id: procedureId, tipo: execucao.tipo, valor: execucao.valor }
}

// ─── As linhas de um atendimento ─────────────────────────────────────────────

export type OrigemDaComissao = 'AVULSO' | 'PLANO' | 'PACOTE' | 'PACOTE_VENDA' | 'PRE_PAGO' | 'PRODUTO'

/** Um procedimento executado e o preço que serve de base à comissão dele. */
export interface ItemExecutado { procedure_id: string | null; preco: number }

/** O que `concluir_atendimento` recebe por procedimento. O VALOR não vai: é
 *  conta do banco (`comissao_alvo`), a mesma que o pagamento do plano usa. */
export interface LinhaDeComissao {
  procedure_id:      string | null
  origem:            OrigemDaComissao
  treatment_plan_id: string | null
  regra_tipo:        TipoDeRegra
  regra_valor:       number
  preco:             number
}

/**
 * Uma linha por procedimento executado que tenha regra (a geral do
 * procedimento, senão a exceção do profissional, senão o padrão dele).
 * Procedimento sem regra não gera linha — o aviso de "sem comissão" é da
 * tela de configuração.
 */
export function linhasDaComissao(
  itens: ItemExecutado[], regras: RegraDeComissao[], origem: OrigemDaComissao, planoId: string | null,
  gerais: ComissoesGerais = new Map(),
): LinhaDeComissao[] {
  const linhas: LinhaDeComissao[] = []
  for (const item of itens) {
    const regra = regraAplicavel(regras, item.procedure_id, gerais)
    if (!regra) continue
    linhas.push({
      procedure_id: item.procedure_id, origem, treatment_plan_id: origem === 'PLANO' ? planoId : null,
      regra_tipo: regra.tipo, regra_valor: regra.valor,
      preco: Math.max(0, Math.round(item.preco * 100) / 100),
    })
  }
  return linhas
}

/** A base de uma sessão de pacote: o preço do pacote dividido pelas sessões. */
export function precoDaSessaoDePacote(precoDoPacote: number, sessoes: number): number {
  if (!(sessoes > 0)) return 0
  return Math.round(precoDoPacote / sessoes * 100) / 100
}

export function rotuloDaRegra(regra: Pick<RegraDeComissao, 'tipo' | 'valor'> | null): string {
  if (!regra) return 'Sem comissão'
  return regra.tipo === 'PERCENTAGE'
    ? `${String(regra.valor).replace('.', ',')}%`
    : `R$ ${regra.valor.toFixed(2).replace('.', ',')} fixo`
}
