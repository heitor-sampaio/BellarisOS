import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { ProcedimentoAVenda } from '@/components/shared/vender'

/**
 * Procedimento pré-pago (2026-09-30): o que se vende e o que o cliente tem.
 * Separado do pacote de propósito (decisão do Heitor).
 */

/** Os procedimentos que a ficha oferece para vender: os ativos, ao alcance da unidade. */
export async function procedimentosAVenda(tenantId: string, branchId: string | null): Promise<ProcedimentoAVenda[]> {
  if (!branchId) return []
  const linhas = await ler(createAdminClient().from('procedures')
    .select('id, name, price')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .order('name'), 'carregar os procedimentos à venda')
  return ((linhas ?? []) as { id: string; name: string; price: number | null }[])
    .map(p => ({ id: p.id, name: p.name, price: Number(p.price ?? 0) }))
}

export interface UnidadePrePaga {
  id:            string
  numero:        number
  preco:         number
  status:        'DISPONIVEL' | 'USADA' | 'CANCELADA'
  agendamentoId: string | null
  agendamentoEm: string | null
  canceladaPor:  string | null
}

export interface PrePagoDoCliente {
  id:           string
  procedimento: string
  procedureId:  string
  branchId:     string
  quantidade:   number
  price:        number
  desconto:     number
  vendidoEm:    string
  venceEm:      string | null
  /** Calculado no servidor (a tela não lê o relógio na renderização). */
  vencida:      boolean
  disponiveis:  number
  unidades:     UnidadePrePaga[]
}

/** As vendas de pré-pago do cliente, com as unidades — a ficha. */
export async function prePagosDoCliente(tenantId: string, clientId: string): Promise<PrePagoDoCliente[]> {
  const linhas = await ler(createAdminClient().from('procedure_sales')
    .select(`id, procedure_id, branch_id, quantity, price, desconto, sold_at, expires_at, procedures(name),
             procedure_sale_units(id, numero, preco, status, appointment_id, cancel_reason, appointments(scheduled_at, status))`)
    .eq('tenant_id', tenantId).eq('client_id', clientId)
    .order('sold_at', { ascending: false }), 'carregar os procedimentos pré-pagos do cliente')
  type U = { id: string; numero: number; preco: number; status: UnidadePrePaga['status']; appointment_id: string | null; cancel_reason: string | null
    appointments: { scheduled_at: string; status: string } | null }
  return ((linhas ?? []) as unknown as {
    id: string; procedure_id: string; branch_id: string; quantity: number; price: number; desconto: number
    sold_at: string; expires_at: string | null; procedures: { name: string } | null; procedure_sale_units: U[]
  }[]).map(v => {
    const unidades = [...(v.procedure_sale_units ?? [])].sort((a, b) => a.numero - b.numero).map(u => ({
      id: u.id, numero: u.numero, preco: Number(u.preco), status: u.status,
      agendamentoId: u.appointment_id, agendamentoEm: u.appointments?.scheduled_at ?? null,
      canceladaPor: u.cancel_reason,
    }))
    return {
      id: v.id, procedimento: v.procedures?.name ?? 'Procedimento', procedureId: v.procedure_id, branchId: v.branch_id,
      quantidade: v.quantity, price: Number(v.price), desconto: Number(v.desconto), vendidoEm: v.sold_at, venceEm: v.expires_at,
      vencida: v.expires_at != null && new Date(v.expires_at).getTime() < Date.now(),
      disponiveis: unidades.filter(u => u.status === 'DISPONIVEL').length, unidades,
    }
  })
}
