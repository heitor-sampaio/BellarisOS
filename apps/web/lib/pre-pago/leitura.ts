import 'server-only'
import { COLUNAS_DA_OFERTA, ofereceNaUnidade } from '@/lib/procedimentos/disponivel-na-unidade'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { ProcedimentoAVenda } from '@/components/shared/vender'
import { contagemDoPago } from '@/lib/pre-pago/contagem'
import { precosDaUnidade, precoNaUnidade } from '@/lib/procedimentos/preco-na-unidade'

/**
 * Procedimento pré-pago (2026-09-30): o que se vende e o que o cliente tem.
 * Separado do pacote de propósito (decisão do Heitor).
 */

/** Os procedimentos que a ficha oferece para vender: os ativos, ao alcance da unidade. */
export async function procedimentosAVenda(tenantId: string, branchId: string | null): Promise<ProcedimentoAVenda[]> {
  if (!branchId) return []
  // Pré-pago fora do PLANO da rede: nada a oferecer (lib/planos/recursos.ts).
  if (!(await redeTemRecurso(tenantId, 'pre_pago'))) return []
  const admin = createAdminClient()
  const [linhas, daUnidade] = await Promise.all([
    ler(admin.from('procedures')
      .select(`id, name, price, ${COLUNAS_DA_OFERTA}`)
      .eq('tenant_id', tenantId).eq('is_active', true)
      .or(`branch_id.is.null,branch_id.eq.${branchId}`)
      .order('name'), 'carregar os procedimentos à venda'),
    // O preço DA UNIDADE da venda, quando ela tem um (D2 da 9ª).
    precosDaUnidade(admin, branchId),
  ])
  // Só o que a unidade da venda OFERECE (D7 da 13ª, F65).
  return ((linhas ?? []) as { id: string; name: string; price: number | null; branch_id: string | null; procedure_branch_availability: { branch_id: string }[] | null }[])
    .filter(p => ofereceNaUnidade(p, branchId))
    .map(p => ({ id: p.id, name: p.name, price: precoNaUnidade(p.price, daUnidade.get(p.id)) }))
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
  /** Disponíveis SEM agendamento (A27: a agendada não está "para agendar"). */
  disponiveis:  number
  /** Disponíveis com agendamento ligado. */
  agendadas:    number
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
      ...(() => {
        const c = contagemDoPago(unidades.map(u => ({ status: u.status, agendada: !!u.agendamentoId })))
        return { disponiveis: c.paraAgendar, agendadas: c.agendadas }
      })(),
      unidades,
    }
  })
}
