import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { configDaRede, saldoDoCliente } from '@/lib/fidelidade/leitura'
import { calcularDescontoComPontos } from '@/lib/fidelidade/resgate'
import { descontoDoVoucher, type VoucherParaCalculo } from '@/lib/fidelidade/voucher'
import type { FidelidadeDaVenda, EscolhaDaFidelidade } from '@/lib/fidelidade/conta-na-venda'

type Admin = ReturnType<typeof createAdminClient>

/**
 * FD2a na "Nova venda" do PDV (o plano de adaptação, 2026-11-13): o que a
 * cliente pode usar da fidelidade nesta venda — o saldo e as regras dos
 * pontos, e os vouchers de DESCONTO dela (o de procedimento paga o
 * atendimento daquele procedimento; o de produto é entregue). Nula: nada a
 * oferecer (programa desligado, sem saldo e sem voucher).
 */
export async function fidelidadeParaAVenda(
  tenantId: string, clienteId: string, branchId: string, admin: Admin = createAdminClient(),
): Promise<FidelidadeDaVenda | null> {
  const cfg = await configDaRede(tenantId, admin)
  if (!cfg.enabled) return null
  const [saldoLido, meus] = await Promise.all([
    saldoDoCliente(clienteId, cfg.scope_per_branch ? branchId : null, admin),
    ler(admin.from('loyalty_vouchers')
      .select('id, name, type, status, expires_at, procedure_id, discount_value, branch_id')
      .eq('client_id', clienteId).eq('tenant_id', tenantId).eq('status', 'ATIVO')
      .in('type', ['DESCONTO_VALOR', 'DESCONTO_PERCENTUAL']), 'buscar os vouchers da cliente'),
  ])
  const agora = Date.now()
  const vouchers = ((meus ?? []) as (VoucherParaCalculo & { id: string; name: string; branch_id: string })[])
    .filter(v => (!cfg.scope_per_branch || v.branch_id === branchId) && new Date(v.expires_at).getTime() > agora)
    .map(v => ({ id: v.id, name: v.name, type: v.type, status: v.status, expires_at: v.expires_at, procedure_id: v.procedure_id, discount_value: v.discount_value }))
  const saldo = cfg.redeem_points_value > 0 ? Math.max(0, saldoLido) : 0
  if (saldo <= 0 && vouchers.length === 0) return null
  return { saldo, valorDoPonto: cfg.redeem_points_value, minimo: cfg.redeem_min_points, tetoPct: cfg.redeem_max_pct, vouchers }
}

/**
 * A conta da fidelidade numa venda, NO SERVIDOR (o que o navegador mostra não
 * entra): o voucher sobre o valor vendido, depois os pontos sobre o que sobra.
 * O banco (`venda_com_fidelidade` → `private.fidelidade_na_venda`) confere de
 * novo, dentro da transação. Nulo = nada pedido.
 */
export async function fidelidadeDaVenda(args: {
  tenantId: string; clienteId: string; branchId: string; vendido: number
  escolha: EscolhaDaFidelidade | null | undefined; aVista: boolean; admin?: Admin
}): Promise<{ error: string } | { dados: { pontos: number; desconto: number; voucher_id: string | null; desconto_voucher: number } | null }> {
  const pedido = Math.trunc(Number(args.escolha?.pontos ?? 0) || 0)
  const voucherId = typeof args.escolha?.voucherId === 'string' && args.escolha.voucherId ? args.escolha.voucherId : null
  if (pedido <= 0 && !voucherId) return { dados: null }
  if (pedido < 0) return { error: 'Pontos inválidos.' }
  if (voucherId && !/^[0-9a-f-]{36}$/i.test(voucherId)) return { error: 'Voucher não encontrado para esta cliente.' }
  if (!args.aVista) return { error: 'Os pontos e o voucher se usam no pagamento à vista.' }
  const admin = args.admin ?? createAdminClient()
  const cfg = await configDaRede(args.tenantId, admin)
  if (!cfg.enabled) return { error: 'O programa de fidelidade está desligado nesta rede.' }

  let base = Math.round(args.vendido * 100) / 100
  let descontoVoucher = 0
  if (voucherId) {
    const v = await ler(admin.from('loyalty_vouchers')
      .select('type, status, expires_at, procedure_id, discount_value, client_id')
      .eq('id', voucherId).eq('tenant_id', args.tenantId).maybeSingle(), 'buscar o voucher')
    if (!v || v.client_id !== args.clienteId) return { error: 'Voucher não encontrado para esta cliente.' }
    if (v.type !== 'DESCONTO_VALOR' && v.type !== 'DESCONTO_PERCENTUAL') {
      return { error: 'Este voucher não vale nesta venda: o de procedimento se usa no atendimento, e o de produto é entregue.' }
    }
    const dv = descontoDoVoucher(v as VoucherParaCalculo, { procedureId: null, preco: base })
    if (dv.motivo) return { error: dv.motivo }
    descontoVoucher = dv.desconto
    base = Math.round((base - descontoVoucher) * 100) / 100
  }
  let pontos = 0, desconto = 0
  if (pedido > 0) {
    const saldo = await saldoDoCliente(args.clienteId, cfg.scope_per_branch ? args.branchId : null, admin)
    const r = calcularDescontoComPontos({
      saldo, preco: base, pedido,
      regras: { valorDoPonto: cfg.redeem_points_value, minimo: cfg.redeem_min_points, tetoPct: cfg.redeem_max_pct },
    })
    if (r.motivo) return { error: r.motivo }
    pontos = r.pontos; desconto = r.desconto
  }
  return { dados: { pontos, desconto, voucher_id: voucherId, desconto_voucher: descontoVoucher } }
}
