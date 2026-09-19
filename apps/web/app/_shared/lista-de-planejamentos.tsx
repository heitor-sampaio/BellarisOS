import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { listarPlanejamentos } from '@/actions/treatment-plans'
import { getCachedNetworkBranches } from '@/lib/cached-queries'
import { PlanejamentosClient } from '@/components/branch/planejamentos-client'

/**
 * Planejamentos — a mesma tela nos dois portais.
 *
 * O plano deixou de morar "dentro de" alguém: ele tem nome, existe antes de
 * haver cliente e é encontrado pela busca. Esta tela é a visão geral; a aba no
 * perfil do cliente continua como o caminho de quem está com a pessoa na frente.
 *
 * Aqui é só a lista: o plano aberto é a rota `<basePath>/<id>`, que carrega o
 * catálogo de procedimentos por conta própria — esta tela não precisa dele.
 *
 * `branchId` nulo = rede inteira.
 */
export async function ListaDePlanejamentos({
  branchId, branchName, basePath,
}: {
  branchId:   string | null
  branchName: string | null
  /** Rota da lista — `/admin/planejamentos` ou `/<slug>/planejamentos`. */
  basePath:   string
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')

  // Na rede não existe "a filial atual", e o plano precisa de uma: é ela que
  // decide o caixa que recebe e a agenda onde as sessões caem. Por isso o
  // portal da rede pergunta a unidade ao criar, em vez de recusar depois.
  const [{ planos }, unidades] = await Promise.all([
    listarPlanejamentos({ branchId }),
    branchId ? Promise.resolve([]) : getCachedNetworkBranches(ctx.tenantId!),
  ])

  return (
    <PlanejamentosClient
      planosIniciais={planos}
      branchId={branchId ?? ''}
      branchName={branchName}
      basePath={basePath}
      unidades={unidades as { id: string; name: string }[]}
      podeEditar={can(ctx, 'medical_records', 'MANAGE')}
    />
  )
}
