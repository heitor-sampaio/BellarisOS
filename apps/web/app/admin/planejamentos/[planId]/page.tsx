import { redirect } from 'next/navigation'
import { DetalheDePlano } from '@/app/_shared/detalhe-de-plano'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'

/** Um plano de tratamento aberto pelo portal da rede. */
export default async function AdminPlanoPage({
  params,
}: {
  params: Promise<{ planId: string }>
}) {
  const { planId } = await params
  // A18 da 6ª simulação: "/planejamentos/novo" dava 404 — o novo plano é o
  // "Novo plano" da lista, que abre por ?novo=1 (para quem monta).
  if (planId === 'novo') redirect('/admin/planejamentos?novo=1')
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(planId)
  // A trava da PÁGINA (§6: o layout protege a navegação, não a URL).
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  assertPermission(ctx, 'agenda', 'VIEW')
  return <DetalheDePlano planId={planId} branchId={null} slug="" basePath="/admin/planejamentos" />
}
