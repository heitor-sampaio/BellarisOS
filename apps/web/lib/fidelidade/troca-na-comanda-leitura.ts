import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { can, temRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { configDaRede, saldoDoCliente, recompensasDaRede } from '@/lib/fidelidade/leitura'
import { quemTrocaPontos } from '@/lib/equipe/quem-desfaz'
import { recompensasDaComanda, textoDeQuemTroca, type TrocaNaComanda } from '@/lib/fidelidade/troca-na-comanda'

/**
 * A50 da 24ª: a troca de pontos que a comanda oferece (lib/fidelidade/troca-na-comanda.ts).
 * Nula quando não há o que trocar: a fidelidade fora do plano ou desligada, ou
 * o saldo não alcança nenhuma recompensa que vale nesta comanda (princípio 7:
 * o bloco aparece quando serve). A rede e o alcance, quem chama já conferiu.
 */
export async function trocaNaComanda(
  ctx: TenantContext,
  args: { clienteId: string; branchId: string; procedimentoId: string | null },
): Promise<TrocaNaComanda | null> {
  if (!temRecurso(ctx, 'fidelidade')) return null
  const admin = createAdminClient()
  const cfg = await configDaRede(ctx.tenantId!, admin)
  if (!cfg.enabled) return null
  const [saldo, catalogo] = await Promise.all([
    saldoDoCliente(args.clienteId, admin),
    recompensasDaRede(ctx.tenantId!, true, admin),
  ])
  const recompensas = recompensasDaComanda(catalogo, args.procedimentoId)
    .map(r => ({ id: r.id, name: r.name, type: r.type, points_cost: r.points_cost, procedure_id: r.procedure_id }))
  if (!recompensas.some(r => r.points_cost <= saldo)) return null
  const podeTrocar = can(ctx, 'loyalty', 'MANAGE')
  return {
    clienteId: args.clienteId, branchId: args.branchId, saldo, podeTrocar, recompensas,
    quemTroca: podeTrocar ? null : textoDeQuemTroca(await quemTrocaPontos(ctx.tenantId!, args.branchId)),
  }
}
