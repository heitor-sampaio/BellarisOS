import type { TenantContext } from '@estetica-os/types'
import { can, isOwnScope, podeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { getAtendimentosAReceber, type ListaAReceber } from '@/lib/metrics/a-receber'
import type { ProfileTransaction, ProfileInternalCredit } from '@/components/branch/client-profile'

/**
 * O financeiro da ficha da cliente — o mesmo nos dois portais (a ficha da
 * unidade e a da rede repetiam a leitura).
 *
 * Quem vê: o financeiro ou quem recebe (simulação de 2026-10-20: a aba abria
 * para o SDR). Com `financial: só os próprios` e sem receber — a Profissional,
 * que tem o financeiro para ver as comissões DELA —, só o que é dos
 * atendimentos dela, totais incluídos (D6 da simulação de 2026-10-27; ela via
 * o total pago e a receber de todos). Quem recebe vê tudo: recebe de todos.
 *
 * Os totais vêm do banco (`metrics_financeiro_do_cliente`): a aba somava na
 * tela as últimas 50 linhas.
 */
export interface FinanceiroDaFicha {
  veFinanceiro:    boolean
  /** Recortado pelos atendimentos de quem vê. */
  soOsProprios:    boolean
  transactions:    ProfileTransaction[]
  internalCredits: ProfileInternalCredit[]
  totais:          { pago: number; aReceber: number; credito: number | null }
  aReceber:        ListaAReceber
}

const VAZIO: ListaAReceber = { itens: [], total: { n: 0, valor: 0 } }

type Linha = {
  id: string; type: string; description: string; amount: number | string; payment_method: string | null
  cartao_vezes: number | null; is_paid: boolean; paid_at: string | null; created_at: string; due_date: string | null
  notes: string | null; category: string | null; appointment_id: string | null
  appointment: { scheduled_at: string; professional_id: string | null; procedures: { name: string } | null } | null
}

export async function financeiroDaFicha(ctx: TenantContext, clientId: string): Promise<FinanceiroDaFicha> {
  const veFinanceiro = can(ctx, 'financial', 'VIEW') || podeReceber(ctx)
  if (!veFinanceiro) {
    return { veFinanceiro, soOsProprios: false, transactions: [], internalCredits: [], totais: { pago: 0, aReceber: 0, credito: null }, aReceber: VAZIO }
  }
  const soOsProprios = isOwnScope(ctx, 'financial') && ctx.permissions.cashier !== 'MANAGE'
  const meu = soOsProprios ? (ctx.internalUserId ?? '00000000-0000-0000-0000-000000000000') : null
  const admin = createAdminClient()

  const [linhas, totaisRaw, aReceber, creditos] = await Promise.all([
    lerTodas<unknown>((de, ate) => {
      let q = admin.from('financial_transactions')
        .select(`id, type, description, amount, payment_method, cartao_vezes, is_paid, paid_at, created_at, due_date, notes, category, appointment_id,
          branches!inner(tenant_id),
          appointment:appointments!financial_transactions_appointment_id_fkey${meu ? '!inner' : ''}(scheduled_at, professional_id, procedures(name))`)
        .eq('client_id', clientId).eq('branches.tenant_id', ctx.tenantId!)
      if (meu) q = q.eq('appointment.professional_id', meu)
      return q.order('created_at', { ascending: false }).order('id').range(de, ate)
    }, 'carregar os lançamentos da cliente'),
    ler(admin.rpc('metrics_financeiro_do_cliente', { p_tenant: ctx.tenantId!, p_client: clientId, p_profissional: meu }),
      'calcular os totais da cliente'),
    getAtendimentosAReceber({ tenantId: ctx.tenantId!, clienteId: clientId, profissionalId: meu }),
    soOsProprios ? Promise.resolve([]) : ler(admin.from('internal_credits')
      .select('id, amount, description, created_at').eq('client_id', clientId)
      .order('created_at', { ascending: false }), 'carregar o crédito interno'),
  ])

  const t = ((totaisRaw ?? []) as { pago: number | string; a_receber: number | string; credito: number | string | null }[])[0]
  const transactions: ProfileTransaction[] = (linhas as Linha[]).map(l => ({
    id:            l.id,
    description:   l.description,
    amount:        Number(l.amount),
    paymentMethod: l.payment_method,
    cartaoVezes:   l.cartao_vezes,
    isPaid:        l.is_paid,
    paidAt:        l.paid_at,
    createdAt:     l.created_at,
    procedureName: l.appointment?.procedures?.name ?? null,
    scheduledAt:   l.appointment?.scheduled_at ?? null,
    dueDate:       l.due_date,
    isCheckout:    !l.appointment_id && l.category !== 'Estorno',
    // O estorno com o sinal certo e o original marcado (D6, 2026-10-28).
    estornada:     l.notes === 'Estornada',
    estorno:       l.category === 'Estorno',
    saida:         l.type === 'EXPENSE',
  })).sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))

  return {
    veFinanceiro, soOsProprios, transactions, aReceber,
    internalCredits: ((creditos ?? []) as { id: string; amount: number | string; description: string; created_at: string }[])
      .map(c => ({ id: c.id, amount: Number(c.amount), description: c.description, createdAt: c.created_at })),
    totais: {
      pago:     Number(t?.pago ?? 0),
      aReceber: Number(t?.a_receber ?? 0),
      credito:  t?.credito == null ? null : Number(t.credito),
    },
  }
}
