import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { procedimentosParaPlano } from '@/lib/checkout/procedimentos-do-plano'
import { InjetavelAberto } from '@/components/branch/injetavel-aberto'

/**
 * Um planejamento de injetáveis, nos dois portais.
 *
 * Os produtos oferecidos no mapa são os do estoque: é o que a clínica de fato
 * aplica, e assim o nome do que se planeja bate com o nome do que sai de lá.
 * O planejamento em si é carregado pelo `MapaInjetavel`, que já o relê a cada
 * salvamento — buscá-lo aqui também só daria duas verdades para a mesma tela.
 */
export async function DetalheDeInjetavel({
  mapId, slug, basePath,
}: {
  mapId:    string
  /** Filial do registro; vazio no portal da rede. */
  slug:     string
  basePath: string
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'VIEW')

  const catalogo = await procedimentosParaPlano(ctx.tenantId!)

  return (
    <InjetavelAberto
      mapId={mapId}
      slug={slug}
      basePath={basePath}
      produtos={catalogo.products.map(p => p.name)}
      podeEditar={can(ctx, 'medical_records', 'MANAGE')}
    />
  )
}
