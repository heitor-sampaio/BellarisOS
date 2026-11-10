import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { vencimentoDoDia } from '@/lib/financeiro/vencimentos'
import { dayKeyTZ } from '@/lib/datetime'
import { bandeiraDoPagamento, ehBandeira } from '@/lib/financeiro/bandeiras'
import { recusaDasVezesDaRede } from '@/lib/financeiro/vezes-da-rede'
import { TETO_DE_VEZES } from '@/lib/financeiro/vezes-do-cartao'

/**
 * LANÇAR (receita ou despesa, à vista ou com vencimento) e DAR BAIXA — os
 * núcleos que o financeiro (actions/financial.ts) e o Copilot dividem
 * (2026-10-08). Não conferem o módulo (quem chama confere: lançar é
 * `financial` MANAGE, dar baixa é do caixa); conferem a unidade — da rede e
 * ao alcance.
 */

type Admin = ReturnType<typeof createAdminClient>

// As listas moram em ./categorias (puro: a tela usa a mesma).
export { CATEGORIAS_DE_RECEITA, CATEGORIAS_DE_DESPESA } from '@/lib/financeiro/categorias'
export const FORMAS_DE_PAGAMENTO = ['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD'] as const

export interface NovoLancamento {
  branchId: string
  tipo: 'INCOME' | 'EXPENSE'
  categoria: string
  descricao: string
  valor: number
  formaDePagamento?: string | null
  /** "AAAA-MM-DD" (o dia), como o formulário manda. */
  vencimento?: string | null
  pago: boolean
  /**
   * Pago: o DIA do pagamento, "AAAA-MM-DD" (2026-10-21, decisão do Heitor).
   * Sem ele, ou hoje, é agora; antes de hoje, o meio-dia daquele dia em
   * Brasília. No futuro é recusado.
   */
  pagoEm?: string | null
  observacoes?: string | null
  /** A31 da 10ª: o fornecedor (despesa) e a nota fiscal — informação para a contadora. */
  fornecedor?: string | null
  notaFiscal?: string | null
  /** r3-f13-01: a bandeira do cartão do pago agora, opcional. */
  bandeira?: string | null
  /**
   * F16-5 (o Heitor: "ajuste isso para permitir escolher parcelas"): as vezes
   * no crédito da receita PAGA (1 a 12, até o limite da clínica). É UM
   * lançamento pago, com `cartao_vezes`: a operadora deposita em N
   * (`recebiveis_do_cartao`, pelo gatilho, com o prazo e a taxa da bandeira) —
   * não é o parcelado da cliente. Fora do crédito pago, ignorado.
   */
  vezes?: number | null
}

/** O `paid_at` do lançamento pago no dia escolhido. */
export function pagoNoDia(pagoEm: string | null | undefined, agora = new Date()): string | { error: string } {
  if (!pagoEm) return agora.toISOString()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pagoEm)) return { error: 'Data do pagamento inválida.' }
  const hoje = dayKeyTZ(agora)
  if (pagoEm > hoje) return { error: 'A data do pagamento não pode ser no futuro.' }
  return pagoEm === hoje ? agora.toISOString() : vencimentoDoDia(pagoEm)!
}

// O vencimento é um DIA, gravado ao meio-dia de Brasília (lib/financeiro/vencimentos.ts).
export { vencimentoDoDia }

export async function lancarCore(admin: Admin, ctx: TenantContext, l: NovoLancamento): Promise<{ id: string } | { error: string }> {
  // A unidade vem de quem pede. Sem conferir, o lançamento caía na unidade de
  // QUALQUER rede — e quem é de unidade lançava na unidade vizinha.
  if (ctx.branchId !== null && l.branchId !== ctx.branchId) return { error: 'Unidade não identificada.' }
  const unidade = await ler(admin.from('branches').select('id').eq('id', l.branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
    'conferir a unidade do lançamento')
  if (!unidade) return { error: 'Unidade não identificada.' }
  if (!l.categoria) return { error: 'Categoria é obrigatória.' }
  if (!l.descricao) return { error: 'Descrição é obrigatória.' }
  if (!l.valor || l.valor <= 0) return { error: 'Valor deve ser maior que zero.' }
  const pagoEm = l.pago ? pagoNoDia(l.pagoEm) : null
  if (pagoEm && typeof pagoEm !== 'string') return pagoEm
  if (l.bandeira && !ehBandeira(l.bandeira)) return { error: 'Bandeira do cartão desconhecida: use Visa, Mastercard, Elo, Amex, Hipercard ou Outras.' }
  const bandeira = l.pago && l.tipo === 'INCOME' ? bandeiraDoPagamento(l.formaDePagamento, l.bandeira) : null
  // F16-5: o crédito em N vezes da receita paga — até o limite da clínica (D-15).
  const noCreditoPago = l.pago && l.tipo === 'INCOME' && l.formaDePagamento === 'CREDIT_CARD'
  const vezes = noCreditoPago && l.vezes != null ? Math.trunc(l.vezes) : 1
  if (noCreditoPago && (!Number.isFinite(vezes) || vezes < 1 || vezes > TETO_DE_VEZES)) return { error: `As vezes no cartão vão de 1 a ${TETO_DE_VEZES}.` }
  const recusaDasVezes = noCreditoPago ? await recusaDasVezesDaRede(ctx.tenantId!, vezes) : null
  if (recusaDasVezes) return { error: recusaDasVezes }

  const linha = await gravar(admin.from('financial_transactions').insert({
    branch_id:      l.branchId,
    type:           l.tipo,
    category:       l.categoria,
    description:    l.descricao,
    amount:         l.valor,
    payment_method: l.formaDePagamento || null,
    due_date:       vencimentoDoDia(l.vencimento),
    is_paid:        l.pago,
    paid_at:        pagoEm,
    notes:          l.observacoes ?? null,
    created_by:     ctx.internalUserId,
    fornecedor:     l.tipo === 'EXPENSE' ? l.fornecedor?.trim().slice(0, 120) || null : null,
    nota_fiscal:    l.notaFiscal?.trim().slice(0, 60) || null,
    ...(bandeira ? { cartao_bandeira: bandeira } : {}),
    ...(noCreditoPago && vezes >= 2 ? { cartao_vezes: vezes } : {}),
  }).select('id').single(), 'registrar o lançamento') as { id: string }
  return { id: linha.id }
}

/** O lançamento, se for da rede E de uma unidade ao alcance. */
export async function lancamentoAoAlcance(admin: Admin, ctx: TenantContext, id: string) {
  const tx = await ler(admin.from('financial_transactions')
    .select('id, branch_id, type, description, category, amount, due_date, is_paid, notes, client_id, payment_method, branches!inner(tenant_id)')
    .eq('id', id).maybeSingle(), 'buscar o lançamento')
  const tenant = (tx?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  // E a unidade ao alcance (§11): a recepção da A não dá baixa na B.
  if (!tx || tenant !== ctx.tenantId || !alcancaUnidade(ctx, tx.branch_id as string)) return null
  return tx as unknown as {
    id: string; branch_id: string; type: string; description: string | null; category: string | null
    amount: number; due_date: string | null; is_paid: boolean; notes: string | null; client_id: string | null
    payment_method: string | null
  }
}

export async function marcarPagoCore(
  admin: Admin, ctx: TenantContext, transactionId: string, forma?: string | null,
  /** r3-f13-01: a bandeira do cartão, opcional — só vale no cartão. */
  bandeira?: string | null,
  /**
   * F17-5 (o Heitor: "pode"): as vezes no crédito da receita recebida agora —
   * UM pagamento que a operadora deposita em N (`recebiveis_do_cartao`, pelo
   * gatilho, com o prazo e a taxa daquelas vezes e da bandeira), como no
   * "Novo lançamento". Só no crédito; até o limite da clínica (D-15).
   */
  vezes?: number | null,
): Promise<{ ok: true } | { error: string }> {
  const tx = await lancamentoAoAlcance(admin, ctx, transactionId)
  if (!tx) return { error: 'Lançamento não encontrado.' }
  if (bandeira && !ehBandeira(bandeira)) return { error: 'Bandeira do cartão desconhecida: use Visa, Mastercard, Elo, Amex, Hipercard ou Outras.' }
  // A14 da 9ª: o Boleto é forma da despesa.
  if (forma === 'BOLETO' && tx.type !== 'EXPENSE') return { error: 'Boleto é forma de pagar uma despesa.' }
  const daBandeira = bandeiraDoPagamento(forma ?? tx.payment_method, bandeira)
  const recusa = await recusaDasVezesDaBaixa(ctx, tx.type, forma ?? tx.payment_method, vezes)
  if (recusa) return { error: recusa }
  const emVezes = vezes != null && vezes >= 2 ? Math.trunc(vezes) : null
  const agora = new Date().toISOString()
  // Com a guarda: o já pago (ou estornado) não tem o pagamento sobrescrito.
  const feitas = await gravar(admin.from('financial_transactions').update({
    is_paid: true, paid_at: agora, updated_at: agora,
    ...(forma ? { payment_method: forma } : {}),
    ...(daBandeira ? { cartao_bandeira: daBandeira } : {}),
    ...(emVezes ? { cartao_vezes: emVezes } : {}),
  }).eq('id', transactionId).eq('is_paid', false).or('notes.is.null,notes.neq.Estornada').select('id'), 'dar baixa no lançamento') as { id: string }[] | null
  if (!feitas?.length) return { error: 'Esse lançamento já está pago (ou foi estornado).' }
  return { ok: true }
}

/**
 * As vezes de uma baixa (F17-5): só a receita no crédito tem vezes, de 1 ao
 * limite da clínica. Vazio é 1x. O Copilot confere no cartão (preparar) com a
 * mesma regra.
 */
export async function recusaDasVezesDaBaixa(ctx: TenantContext, tipo: string, forma: string | null, vezes: number | null | undefined): Promise<string | null> {
  if (vezes == null || vezes === 1) return null
  if (tipo !== 'INCOME' || forma !== 'CREDIT_CARD') return 'As vezes no cartão são só no crédito (o débito é 1x).'
  if (!Number.isInteger(vezes) || vezes < 1 || vezes > TETO_DE_VEZES) return `As vezes no cartão vão de 1 a ${TETO_DE_VEZES}.`
  return recusaDasVezesDaRede(ctx.tenantId!, vezes)
}
