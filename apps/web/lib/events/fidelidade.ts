import { createAdminClient } from '@/lib/supabase/admin'
import { emitirEvento, atorDoContexto, ATOR_SISTEMA } from './emitir'
import { EVENTOS, type AtorDoEvento } from '@estetica-os/types'

type Ctx = { tenantId?: string | null; internalUserId?: string | null; userName?: string | null; ator?: AtorDoEvento }

/**
 * Fidelidade — os fatos que saem do APP. O ganho de pontos sai do gatilho do
 * pagamento (`fidelidade.pontos_ganhos`, origem 'banco'); a troca por uma
 * recompensa é uma ação da equipe, e sai daqui, depois de o banco gravar.
 *
 * Nunca lança (como todo emissor): o voucher já existe; perder o evento é
 * ruim, derrubar a tela por causa dele seria pior.
 */
export async function voucherEmitido(voucherId: string, ctx: Ctx): Promise<void> {
  try {
    if (!ctx.tenantId) return
    const { data, error } = await createAdminClient()
      .from('loyalty_vouchers')
      .select('branch_id, client_id, name, type, points_cost, expires_at, clients(name)')
      .eq('id', voucherId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle()
    if (error || !data) {
      if (error) console.error('[voucherEmitido] retrato:', error.message)
      return
    }
    const v = data as unknown as {
      branch_id: string; client_id: string; name: string; type: string
      points_cost: number; expires_at: string; clients: { name: string } | null
    }
    await emitirEvento(EVENTOS.FIDELIDADE_VOUCHER_EMITIDO, {
      tenantId:   ctx.tenantId,
      branchId:   v.branch_id,
      entidadeId: voucherId,
      dados: {
        clienteId:   v.client_id,
        clienteNome: v.clients?.name ?? null,
        recompensa:  v.name,
        tipo:        v.type,
        pontos:      v.points_cost,
        validoAte:   v.expires_at,
      },
      ator: ctx.ator ?? (ctx.internalUserId ? atorDoContexto(ctx) : ATOR_SISTEMA),
      chave: `fidelidade.voucher_emitido:${voucherId}`,
    })
  } catch (e) {
    console.error('[voucherEmitido]', (e as Error).message)
  }
}
