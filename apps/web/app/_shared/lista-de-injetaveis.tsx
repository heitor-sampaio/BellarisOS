import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const admin = createAdminClient()

  const [{ mapas, error }, catalogo, { data: clientesRaw, error: clientesErro }] = await Promise.all([
    listarMapasDeInjetaveis({ branchId }),
    procedimentosParaPlano(ctx.tenantId!),
    // Clientes para a busca. O mapa é do cliente, e cliente é da REDE — na
    // unidade a lista segue a mesma regra das outras telas: quem frequenta.
    admin
      .from('clients')
      .select('id, name, phone')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name')
      .limit(500),
  ])

  // Consulta que falhou não é "a clínica não tem mapa": sem checar, a tela
  // convidaria a recomeçar um planejamento que já existe.
  if (error || clientesErro) {
    console.error('[injetaveis]', error ?? clientesErro?.message)
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
        Não foi possível carregar os mapas agora. Tente recarregar em instantes.
      </div>
    )
  }

  return (
    <InjetaveisClient
      mapas={mapas}
      clientes={(clientesRaw ?? []) as { id: string; name: string; phone: string | null }[]}
      produtos={catalogo.products.map(p => p.name)}
      slug={slug}
      podeEditar={can(ctx, 'medical_records', 'MANAGE')}
    />
  )
}
