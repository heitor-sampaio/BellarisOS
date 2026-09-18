import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { listarMapasDeInjetaveis } from '@/actions/injectable-map'
import { procedimentosParaPlano } from '@/lib/checkout/procedimentos-do-plano'
import { InjetaveisClient } from '@/components/branch/injetaveis-client'

/**
 * Injetáveis — a mesma tela nos dois portais.
 *
 * `branchId` nulo = rede inteira. Os produtos oferecidos no mapa são os do
 * estoque: é o que a clínica de fato aplica, e assim o nome do que se planeja
 * bate com o nome do que sai do estoque.
 */
export async function ListaDeInjetaveis({
  branchId, slug,
}: {
  branchId: string | null
  slug:     string
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'VIEW')

  const [{ mapas, error }, catalogo] = await Promise.all([
    listarMapasDeInjetaveis({ branchId }),
    procedimentosParaPlano(ctx.tenantId!),
  ])

  // Consulta que falhou não é "a clínica não tem planejamento": sem checar, a
  // tela convidaria a recomeçar um que já existe.
  if (error) {
    console.error('[injetaveis]', error)
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Não foi possível carregar os planejamentos agora. Tente recarregar em instantes.
      </div>
    )
  }

  return (
    <InjetaveisClient
      mapas={mapas}
      produtos={catalogo.products.map(p => p.name)}
      slug={slug}
      branchId={branchId ?? ''}
      podeEditar={can(ctx, 'medical_records', 'MANAGE')}
    />
  )
}
