import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { vencimentoDoDia } from '@/lib/financeiro/vencimentos'

/**
 * LANÇAR (receita ou despesa, à vista ou com vencimento) e DAR BAIXA — os
 * núcleos que o financeiro (actions/financial.ts) e o Copilot dividem
 * (2026-10-08). Não conferem o módulo (quem chama confere: lançar é
 * `financial` MANAGE, dar baixa é do caixa); conferem a unidade — da rede e
 * ao alcance.
 */

type Admin = ReturnType<typeof createAdminClient>

export const CATEGORIAS_DE_RECEITA = ['Atendimento', 'Venda de produto', 'Taxa de agendamento', 'Pacote de sessões', 'Outro'] as const
export const CATEGORIAS_DE_DESPESA = ['Fornecedores', 'Aluguel', 'Salários', 'Equipamentos', 'Manutenção', 'Marketing', 'Material de escritório', 'Outro'] as const
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
  observacoes?: string | null
}

// O vencimento é um DIA, gravado ao meio-dia de Brasília (lib/financeiro/vencimentos.ts).
export { vencimentoDoDia }

export async function lancarCore(admin: Admin, ctx: TenantContext, l: NovoLancamento): Promise<{ id: string } | { error: string }> {
  // A unidade vem de quem pede. Sem conferir, o lançamento caía na unidade de
  // QUALQUER rede — e quem é de unidade lançava na unidade vizinha.
  if (ctx.branchId !== null && l.branchId !== ctx.branchId) return { error: 'Filial não identificada.' }
  const unidade = await ler(admin.from('branches').select('id').eq('id', l.branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
    'conferir a unidade do lançamento')
  if (!unidade) return { error: 'Filial não identificada.' }
  if (!l.categoria) return { error: 'Categoria é obrigatória.' }
  if (!l.descricao) return { error: 'Descrição é obrigatória.' }
  if (!l.valor || l.valor <= 0) return { error: 'Valor deve ser maior que zero.' }

  const linha = await gravar(admin.from('financial_transactions').insert({
    branch_id:      l.branchId,
    type:           l.tipo,
    category:       l.categoria,
    description:    l.descricao,
    amount:         l.valor,
    payment_method: l.formaDePagamento || null,
    due_date:       vencimentoDoDia(l.vencimento),
    is_paid:        l.pago,
    paid_at:        l.pago ? new Date().toISOString() : null,
    notes:          l.observacoes ?? null,
    created_by:     ctx.internalUserId,
  }).select('id').single(), 'registrar o lançamento') as { id: string }
  return { id: linha.id }
}

/** O lançamento, se for da rede E de uma unidade ao alcance. */
export async function lancamentoAoAlcance(admin: Admin, ctx: TenantContext, id: string) {
  const tx = await ler(admin.from('financial_transactions')
    .select('id, branch_id, type, description, category, amount, due_date, is_paid, notes, client_id, branches!inner(tenant_id)')
    .eq('id', id).maybeSingle(), 'buscar o lançamento')
  const tenant = (tx?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  // E a unidade ao alcance (§11): a recepção da A não dá baixa na B.
  if (!tx || tenant !== ctx.tenantId || !alcancaUnidade(ctx, tx.branch_id as string)) return null
  return tx as unknown as {
    id: string; branch_id: string; type: string; description: string | null; category: string | null
    amount: number; due_date: string | null; is_paid: boolean; notes: string | null; client_id: string | null
  }
}

export async function marcarPagoCore(admin: Admin, ctx: TenantContext, transactionId: string, forma?: string | null): Promise<{ ok: true } | { error: string }> {
  const tx = await lancamentoAoAlcance(admin, ctx, transactionId)
  if (!tx) return { error: 'Lançamento não encontrado.' }
  const agora = new Date().toISOString()
  // Com a guarda: o já pago (ou estornado) não tem o pagamento sobrescrito.
  const feitas = await gravar(admin.from('financial_transactions').update({
    is_paid: true, paid_at: agora, updated_at: agora,
    ...(forma ? { payment_method: forma } : {}),
  }).eq('id', transactionId).eq('is_paid', false).or('notes.is.null,notes.neq.Estornada').select('id'), 'dar baixa no lançamento') as { id: string }[] | null
  if (!feitas?.length) return { error: 'Esse lançamento já está pago (ou foi estornado).' }
  return { ok: true }
}
