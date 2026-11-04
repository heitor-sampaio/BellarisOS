import { redirect } from 'next/navigation'
import { DetalheDePlano } from '@/app/_shared/detalhe-de-plano'
import { idOu404 } from '@/lib/id-da-rota'

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
  return <DetalheDePlano planId={planId} branchId={null} slug="" basePath="/admin/planejamentos" />
}
