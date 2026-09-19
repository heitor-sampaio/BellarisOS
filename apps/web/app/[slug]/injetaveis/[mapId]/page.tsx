import { DetalheDeInjetavel } from '@/app/_shared/detalhe-de-injetavel'

/** Um planejamento aberto pelo portal da unidade. */
export default async function BranchInjetavelPage({
  params,
}: {
  params: Promise<{ slug: string; mapId: string }>
}) {
  const { slug, mapId } = await params
  return <DetalheDeInjetavel mapId={mapId} slug={slug} basePath={`/${slug}/injetaveis`} />
}
