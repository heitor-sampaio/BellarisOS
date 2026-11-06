import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { getFechamentoDoDia } from '@/lib/metrics/queries'

/**
 * O que o Fechamento do dia mostra AO LADO do resumo por forma (8ª simulação,
 * 2026-11-06). Os totais saem daqui, em centavos — a tela não soma.
 */

export interface EstornoDoDia {
  id:        string
  descricao: string
  forma:     string | null
  vezes:     number | null
  valor:     number
  motivo:    string | null
}

/**
 * A42: os estornos FEITOS no dia na unidade — o contra-lançamento
 * (`category = 'Estorno'`, pago no dia). Pela regra única, a venda estornada e
 * o estorno saem das entradas e das saídas, e o resumo do dia não mostrava que
 * o dinheiro voltou à cliente ("Saídas R$ 0"). A lista é do dia (curta), e o
 * total é a soma dela, em centavos.
 */
export async function getEstornosDoDia(args: { tenantId: string; branchId: string; from: Date; to: Date }): Promise<{ itens: EstornoDoDia[]; total: number }> {
  const linhas = await lerTodas((de, ate) => createAdminClient().from('financial_transactions')
    .select('id, description, payment_method, cartao_vezes, amount, estorno_motivo, branches!inner(tenant_id)')
    .eq('branch_id', args.branchId).eq('branches.tenant_id', args.tenantId)
    .eq('category', 'Estorno').eq('is_paid', true)
    .gte('paid_at', args.from.toISOString()).lte('paid_at', args.to.toISOString())
    .order('paid_at').order('id').range(de, ate), 'carregar os estornos do dia')
  const itens = (linhas ?? []).map(t => ({
    id: t.id as string, descricao: String(t.description ?? 'Estorno'),
    forma: (t.payment_method as string | null) ?? null, vezes: (t.cartao_vezes as number | null) ?? null,
    valor: Number(t.amount ?? 0), motivo: (t.estorno_motivo as string | null) ?? null,
  }))
  const centavos = itens.reduce((s, i) => s + Math.round(i.valor * 100), 0)
  return { itens, total: centavos / 100 }
}

export interface MovimentoDaUnidade { id: string; nome: string; entradas: number; saidas: number; lancamentos: number }

/**
 * A45: o dia de CADA unidade e o da clínica (a mesma conta do Fechamento,
 * `getFechamentoDoDia`, por unidade), para o Fechamento da rede abrir na que
 * teve movimento e mostrar o todo. O total é em centavos.
 */
export async function getMovimentoDasUnidades(args: {
  tenantId: string; unidades: { id: string; name: string }[]; from: Date; to: Date
}): Promise<{ unidades: MovimentoDaUnidade[]; total: { entradas: number; saidas: number; lancamentos: number } }> {
  const resumos = await Promise.all(args.unidades.map(u =>
    getFechamentoDoDia({ tenantId: args.tenantId, branchId: u.id, from: args.from, to: args.to })))
  const unidades = args.unidades.map((u, i) => ({
    id: u.id, nome: u.name,
    entradas: resumos[i]!.total.entradas, saidas: resumos[i]!.total.saidas, lancamentos: resumos[i]!.total.lancamentos,
  }))
  const soma = (k: 'entradas' | 'saidas') => unidades.reduce((s, u) => s + Math.round(u[k] * 100), 0) / 100
  return {
    unidades,
    total: { entradas: soma('entradas'), saidas: soma('saidas'), lancamentos: unidades.reduce((s, u) => s + u.lancamentos, 0) },
  }
}
