import { getTenantContext, assertPermission, can, podeReceber } from '@/lib/auth'
import { listarPlanejamentos } from '@/actions/treatment-plans'
import { procedimentosParaPlano } from '@/lib/checkout/procedimentos-do-plano'
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

  const [{ planos }, procs] = await Promise.all([
    listarPlanejamentos({ branchId }),
    procedimentosParaPlano(ctx.tenantId!),
  ])

  return (
    <PlanejamentosClient
      planosIniciais={planos}
      branchId={branchId ?? ''}
      branchName={branchName}
      slug={slug}
      procedures={procs.procedures}
      availableProducts={procs.products}
      podeEditar={can(ctx, 'medical_records', 'MANAGE')}
      podeReceberr={podeReceber(ctx)}
    />
  )
}
