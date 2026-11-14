import { getTenantContext, assertPermission, assertRecurso } from '@/lib/auth'
import { ListaDePlanejamentos } from '@/app/_shared/lista-de-planejamentos'

/** Planejamentos de toda a rede. */
export default async function AdminPlanejamentosPage() {
  // A trava da PÁGINA (§6: o layout protege a navegação, não a URL).
  const ctx = await getTenantContext()
  assertRecurso(ctx, 'planos_de_tratamento')
  assertPermission(ctx, 'agenda', 'VIEW')
  return <ListaDePlanejamentos branchId={null} branchName={null} basePath="/admin/planejamentos" />
}
