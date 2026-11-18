import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { textoDoVencimento } from '@/lib/financeiro/vencimentos'

/**
 * O que a cliente tem em aberto NO CAIXA desta unidade (CX1, o plano de
 * adaptação do PDV — o Heitor, 13/11: "abrir a cliente no PDV mostra as
 * parcelas em aberto dela, e recebe-se ali"): as parcelas do crediário e os
 * "a receber" das vendas — e, desde 2026-11-16 ("Mesma regra de pagamentos dos
 * outros"), os do atendimento avulso fechado no crediário ou a receber. O
 * atendimento ainda sem forma (o a receber do "Concluir" antigo, sem nota) não
 * entra — ele é a comanda dele, na lista do PDV.
 *
 * Só a unidade do PDV (princípio 3): o dinheiro entra no caixa da unidade do
 * lançamento, e a tela não recebe aqui o que o Fechamento de outra unidade
 * conta. A ficha da cliente mostra os de todas.
 *
 * Nada se soma: cada linha é um lançamento, com o valor dele.
 */
export interface ParcelaEmAberto {
  id:         string
  valor:      number
  numero:     number | null
  total:      number | null
  descricao:  string | null
  /** "Vencida em 10/11", "Vence hoje", "Vence 10/12/2026" — ou nulo, sem data. */
  vencimento: string | null
  vencida:    boolean
  /**
   * A5 da 20ª: a venda da parcela (o pacote, o plano, o atendimento…) — a
   * janela de receber diz as de antes DA MESMA venda que seguem em aberto.
   */
  venda:      string | null
  /**
   * A14 da 23ª: o que já foi pago DESTA parcela (a recebida em duas formas com
   * uma estornada) — o valor acima é o que falta. Zero, nada pago.
   */
  pago:       number
}

/** As chaves da venda que ligam a comanda aos lançamentos dela (A1 da 16ª). */
export const CHAVES_DA_VENDA = ['client_package_id', 'procedure_sale_id', 'product_sale_id', 'credito_vendido_id', 'treatment_plan_id'] as const
export type VendaDaComanda = Partial<Record<(typeof CHAVES_DA_VENDA)[number], string | null>>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function parcelasEmAbertoDaCliente({ branchId, clienteId, fuso, daVenda }: {
  branchId: string; clienteId: string; fuso: string
  /**
   * A1 da 16ª simulação (princípio 7): só as da venda de UMA comanda — a do
   * crediário diz "R$ 800,00 em aberto" e as recebe ali mesmo, com o mesmo
   * "Receber esta parcela" da Nova venda. Sem chave nenhuma, nada.
   */
  daVenda?: VendaDaComanda & {
    /** A comanda do atendimento: o crediário e o a receber dele (2026-11-16). */
    appointment_id?: string | null
    /** E os dos produtos acrescentados nela, recebidos junto. */
    produtos?: string[]
  }
}): Promise<ParcelaEmAberto[]> {
  let filtroDaVenda: string | null = null
  if (daVenda) {
    const partes = CHAVES_DA_VENDA.filter(k => typeof daVenda[k] === 'string' && UUID.test(daVenda[k]!)).map(k => `${k}.eq.${daVenda[k]}`)
    if (typeof daVenda.appointment_id === 'string' && UUID.test(daVenda.appointment_id)) partes.push(`appointment_id.eq.${daVenda.appointment_id}`)
    for (const id of daVenda.produtos ?? []) if (UUID.test(id)) partes.push(`product_sale_id.eq.${id}`)
    if (!partes.length) return []
    filtroDaVenda = partes.join(',')
  }
  let consulta = createAdminClient().from('financial_transactions')
    .select(['id, amount, parcela_numero, parcela_total, parcela_grupo, description, due_date, appointment_id', ...CHAVES_DA_VENDA].join(', '))
    .eq('branch_id', branchId).eq('client_id', clienteId).eq('type', 'INCOME').eq('is_paid', false)
    .is('estorno_de', null).gt('amount', 0)
    .or('notes.is.null,notes.neq.Estornada')
    // O a receber sem forma do "Concluir" antigo (sem nota) é a comanda do atendimento, não uma parcela.
    .or('appointment_id.is.null,notes.not.is.null')
  if (filtroDaVenda) consulta = consulta.or(filtroDaVenda)
  const linhas = await ler(consulta
    .order('due_date', { ascending: true, nullsFirst: false }).order('parcela_numero', { ascending: true, nullsFirst: false }),
    'ler o que a cliente tem em aberto') as ({
      id: string; amount: number | string; parcela_numero: number | null; parcela_total: number | null; parcela_grupo: string | null
      description: string | null; due_date: string | null; appointment_id: string | null
    } & VendaDaComanda)[] | null
  const pagos = await pagoDasParcelas(branchId, (linhas ?? []).map(l => l.parcela_grupo))
  return (linhas ?? []).map(l => {
    const vencimento = textoDoVencimento(l.due_date, new Date(), fuso)
    return {
      id: l.id, valor: Number(l.amount), numero: l.parcela_numero, total: l.parcela_total, descricao: l.description,
      vencimento, vencida: !!vencimento?.startsWith('Vencida'),
      venda: CHAVES_DA_VENDA.map(k => l[k]).find(v => !!v) ?? l.appointment_id ?? null,
      pago: l.parcela_grupo && l.parcela_numero != null ? (pagos.get(`${l.parcela_grupo}:${l.parcela_numero}`) ?? 0) : 0,
    }
  })
}

/**
 * A14 da 23ª: o pago de cada parcela (o grupo do crediário e o número), as
 * partes recebidas e não estornadas — a parcela recebida em formas vira um
 * lançamento por forma, com o mesmo grupo e número (`lancamento_receber_em_formas`).
 */
async function pagoDasParcelas(branchId: string, grupos: (string | null)[]): Promise<Map<string, number>> {
  const unicos = [...new Set(grupos.filter((g): g is string => !!g && UUID.test(g)))]
  const mapa = new Map<string, number>()
  for (let i = 0; i < unicos.length; i += 150) {
    const lote = await ler(createAdminClient().from('financial_transactions')
      .select('amount, parcela_grupo, parcela_numero')
      .eq('branch_id', branchId).eq('type', 'INCOME').eq('is_paid', true).is('estorno_de', null)
      .or('notes.is.null,notes.neq.Estornada').or('category.is.null,category.neq.Estorno')
      .in('parcela_grupo', unicos.slice(i, i + 150)), 'ler o pago das parcelas') as
      { amount: number | string; parcela_grupo: string; parcela_numero: number | null }[] | null
    for (const l of lote ?? []) {
      if (l.parcela_numero == null) continue
      const chave = `${l.parcela_grupo}:${l.parcela_numero}`
      mapa.set(chave, Math.round(((mapa.get(chave) ?? 0) + Number(l.amount)) * 100) / 100)
    }
  }
  return mapa
}
