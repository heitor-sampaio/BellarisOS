import { DetalheDeInjetavel } from '@/app/_shared/detalhe-de-injetavel'

/** Um planejamento aberto pelo portal da rede. */
export default async function AdminInjetavelPage({
  params,
}: {
  params: Promise<{ mapId: string }>
}) {
  const { mapId } = await params
  return <DetalheDeInjetavel mapId={mapId} slug="" basePath="/admin/injetaveis" />
}
