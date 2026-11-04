import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import type { ProximoVencimento } from './queries'

/**
 * O que a OPERADORA do cartão ainda deposita (F2c da 5ª simulação; decisões
 * do Heitor, 2026-11-01: "no financeiro mês a mês, como a receber" e "conta no
 * mês do dia da venda").
 *
 * A venda no crédito em N vezes é UM lançamento pago — a receita entra inteira
 * no dia da venda, pela regra única (`metrics_receitas_pagas`) — e a operadora
 * deposita em N parcelas, uma por mês (`recebiveis_do_cartao`, nascidas por
 * gatilho). As parcelas NÃO são receita nem dívida da cliente: são o fluxo de
 * caixa. A conta mora no banco (`metrics_a_receber_da_operadora`,
 * `recebiveis_do_cartao_lista`); aqui só se lê.
 */
export interface AReceberDaOperadora {
  /** Em aberto com vencimento no período. */
  aReceber:  number
  /** O que a operadora depositou no período (na data ou antecipado). */
  recebido:  number
  /** Todo o em aberto, de qualquer vencimento. */
  emAberto:  number
  /** O primeiro vencimento DEPOIS do período, e quanto vence nele. */
  proximo:   ProximoVencimento | null
}

const n = (v: unknown): number => (v == null ? 0 : Number(v))
const VAZIO: AReceberDaOperadora = { aReceber: 0, recebido: 0, emAberto: 0, proximo: null }

export async function getAReceberDaOperadora(args: {
  tenantId: string; branchIds?: string[] | null; from: Date; to: Date
}): Promise<{ total: AReceberDaOperadora; porUnidade: Record<string, AReceberDaOperadora> }> {
  const { data, error } = await createAdminClient().rpc('metrics_a_receber_da_operadora', {
    p_tenant: args.tenantId, p_branch_ids: args.branchIds ?? null,
    p_from: args.from.toISOString(), p_to: args.to.toISOString(),
  })
  if (error) {
    console.error(`[metrics] metrics_a_receber_da_operadora falhou: ${error.message}`)
    throw new Error(`Não consegui calcular os indicadores (metrics_a_receber_da_operadora): ${error.message}`)
  }
  const linha = (r: Record<string, unknown> | undefined): AReceberDaOperadora => r ? {
    aReceber: n(r.a_receber), recebido: n(r.recebido), emAberto: n(r.em_aberto),
    proximo: r.proximo_dia ? { dia: String(r.proximo_dia), valor: n(r.proximo_valor) } : null,
  } : VAZIO
  const linhas = (data as Record<string, unknown>[] | null) ?? []
  return {
    total: linha(linhas.find(r => r.branch_id == null)),
    porUnidade: Object.fromEntries(linhas.filter(r => r.branch_id != null).map(r => [String(r.branch_id), linha(r)])),
  }
}

export type SituacaoDaParcela = 'A_RECEBER' | 'RECEBIDA' | 'ANTECIPADA' | 'CANCELADA' | 'ESTORNADA'

export interface ParcelaDaOperadora {
  id:            string
  branchId:      string
  transactionId: string
  /** A descrição da venda e de quem foi. */
  descricao:     string
  clienteNome:   string | null
  numero:        number
  total:         number
  /** O que a operadora ainda deve desta parcela (bruto). */
  valor:         number
  valorOriginal: number
  /** O que a operadora tomou de volta (estorno de parcela já recebida). */
  estornado:     number
  taxaPct:       number
  taxa:          number
  liquido:       number
  /** "AAAA-MM-DD", no fuso da clínica. */
  vencimentoDia: string
  situacao:      SituacaoDaParcela
  recebidaNa:    string | null
}

type Linha = Record<string, unknown>

/**
 * A lista do Financeiro: as parcelas que vencem no período MAIS todo o em
 * aberto, de qualquer vencimento (D3 da 6ª simulação: o cartão dizia R$ 2.360
 * em aberto e a lista sumia, porque tudo vencia no mês seguinte). A conta do
 * que entra é do banco (`recebiveis_do_cartao_da_tela`).
 */
export async function getParcelasDaOperadora(args: {
  tenantId: string; branchIds?: string[] | null; from: Date; to: Date
}): Promise<ParcelaDaOperadora[]> {
  const linhas = await lerTodas<Linha>((de, ate) => createAdminClient()
    .rpc('recebiveis_do_cartao_da_tela', {
      p_tenant: args.tenantId, p_branch_ids: args.branchIds ?? null,
      p_from: args.from.toISOString(), p_to: args.to.toISOString(),
    })
    .order('vencimento').order('id')
    .range(de, ate), 'listar as parcelas a receber da operadora')
  return (linhas ?? []).map(r => ({
    id:            String(r.id),
    branchId:      String(r.branch_id),
    transactionId: String(r.transaction_id),
    descricao:     String(r.descricao ?? ''),
    clienteNome:   (r.cliente_nome as string | null) ?? null,
    numero:        n(r.parcela_numero),
    total:         n(r.parcela_total),
    valor:         n(r.valor),
    valorOriginal: n(r.valor_original),
    estornado:     n(r.estornado),
    taxaPct:       n(r.taxa_pct),
    taxa:          n(r.taxa),
    liquido:       n(r.liquido),
    vencimentoDia: String(r.vencimento_dia),
    situacao:      String(r.situacao) as SituacaoDaParcela,
    recebidaNa:    (r.recebida_na as string | null) ?? null,
  }))
}
