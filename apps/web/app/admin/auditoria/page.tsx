import { getTenantContext, assertPermission } from '@/lib/auth'
import { TelaDaAuditoria } from '@/app/_shared/auditoria'
import type { FiltrosDaAuditoria } from '@/lib/auditoria/tipos'

/** A Auditoria no portal da rede (CF3a). A trava é da página: o layout protege a navegação, não a URL. */
export default async function AuditoriaDaRedePage({ searchParams }: { searchParams: Promise<FiltrosDaAuditoria> }) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'audit', 'VIEW')
  return <TelaDaAuditoria ctx={ctx} basePath="/admin/auditoria" slug={null} filtros={await searchParams} />
}
