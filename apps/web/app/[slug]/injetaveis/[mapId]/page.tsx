import { DetalheDeInjetavel } from '@/app/_shared/detalhe-de-injetavel'
import { idOu404 } from '@/lib/id-da-rota'

/** Um planejamento aberto pelo portal da unidade. */
export default async function BranchInjetavelPage({
  params,
}: {
  params: Promise<{ slug: string; mapId: string }>
}) {
  const { slug, mapId } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(mapId)
  return <DetalheDeInjetavel mapId={mapId} slug={slug} basePath={`/${slug}/injetaveis`} />
}
