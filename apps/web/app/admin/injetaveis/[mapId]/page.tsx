import { DetalheDeInjetavel } from '@/app/_shared/detalhe-de-injetavel'
import { idOu404 } from '@/lib/id-da-rota'

/** Um planejamento aberto pelo portal da rede. */
export default async function AdminInjetavelPage({
  params,
}: {
  params: Promise<{ mapId: string }>
}) {
  const { mapId } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(mapId)
  return <DetalheDeInjetavel mapId={mapId} slug="" basePath="/admin/injetaveis" />
}
