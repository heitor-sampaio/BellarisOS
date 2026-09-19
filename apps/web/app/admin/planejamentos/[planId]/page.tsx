import { DetalheDePlano } from '@/app/_shared/detalhe-de-plano'

/** Um plano de tratamento aberto pelo portal da rede. */
export default async function AdminPlanoPage({
  params,
}: {
  params: Promise<{ planId: string }>
}) {
  const { planId } = await params
  return <DetalheDePlano planId={planId} branchId={null} slug="" basePath="/admin/planejamentos" />
}
