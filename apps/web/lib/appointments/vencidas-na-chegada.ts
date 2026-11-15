import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { podeReceber } from '@/lib/auth'
import { ler } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAReceberVencido } from '@/lib/metrics/vencidas'
import { textoDasVencidasNaChegada } from '@/lib/appointments/texto-das-vencidas'

/**
 * D13 da 9ª simulação (decidido pelo princípio 3): o check-in de quem tem
 * parcela VENCIDA avisa — "Mariana tem 1 parcela vencida (R$ 1.294,00, desde
 * 05/11): receba no PDV." —, sem recusar a chegada. Só para quem recebe
 * (`podeReceber`: o PDV ou o Financeiro em Gerenciar; a A39 da 7ª: o saldo é
 * de quem cuida do dinheiro). A conta é a de `getAReceberVencido` (a do
 * cartão "A receber da cliente"). Acessório: se a leitura falha, a chegada
 * vale e o motivo vai ao log.
 *
 * Um lugar só para a agenda (`actions/appointments.ts`) e o Copilot
 * (`fazer_check_in`), que não dava o aviso (ficou de fora do CP1, 16/11).
 */
export async function avisoDasVencidasNaChegada(ctx: TenantContext, appointmentId: string): Promise<string | null> {
  try {
    if (!podeReceber(ctx)) return null
    const admin = createAdminClient()
    const ag = await ler(admin.from('appointments')
      .select('client_id, clients(name), branches!inner(tenant_id)').eq('id', appointmentId).maybeSingle(), 'buscar a cliente do agendamento')
    const tenant = (ag?.branches as unknown as { tenant_id: string } | null)?.tenant_id
    if (!ag?.client_id || tenant !== ctx.tenantId) return null
    const { total } = await getAReceberVencido({ tenantId: ctx.tenantId!, clientId: ag.client_id as string })
    return textoDasVencidasNaChegada((ag.clients as unknown as { name: string } | null)?.name ?? null, total)
  } catch (e) {
    console.error('[agenda] aviso das parcelas vencidas na chegada:', e)
    return null
  }
}
