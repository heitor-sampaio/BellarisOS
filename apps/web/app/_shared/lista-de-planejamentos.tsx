import { getTenantContext, assertPermission, can, podeReceber } from '@/lib/auth'
import { listarPlanejamentos } from '@/actions/treatment-plans'
import { procedimentosParaPlano } from '@/lib/checkout/procedimentos-do-plano'
import { getCachedNetworkBranches } from '@/lib/cached-queries'
import { PlanejamentosClient } from '@/components/branch/planejamentos-client'

/**
 * Planejamentos — a mesma tela nos dois portais.
 *
 * O plano deixou de morar "dentro de" alguém: ele tem nome, existe antes de
 * haver cliente e é encontrado pela busca. Esta tela é a visão geral; a aba no
 * perfil do cliente continua como o caminho de quem está com a pessoa na frente.
 *
 * `branchId` nulo = rede inteira.
 */
export async function ListaDePlanejamentos({
  branchId, branchName, slug,
}: {
  branchId:   string | null
  branchName: string | null
  slug:       string
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')

  // Na rede não existe "a filial atual", e o plano precisa de uma: é ela que
  // decide o caixa que recebe e a agenda onde as sessões caem. Por isso o
  // portal da rede pergunta a unidade ao criar, em vez de recusar depois.
  const [{ planos }, procs, unidades] = await Promise.all([
    listarPlanejamentos({ branchId }),
    procedimentosParaPlano(ctx.tenantId!),
    branchId ? Promise.resolve([]) : getCachedNetworkBranches(ctx.tenantId!),
  ])

  return (
    <PlanejamentosClient
      planosIniciais={planos}
      branchId={branchId ?? ''}
      branchName={branchName}
      slug={slug}
      procedures={procs.procedures}
      availableProducts={procs.products}
      unidades={unidades as { id: string; name: string }[]}
      podeEditar={can(ctx, 'medical_records', 'MANAGE')}
      podeReceberr={podeReceber(ctx)}
    />
  )
}
