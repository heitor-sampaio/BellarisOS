import { getTenantContext, assertAuditoria } from '@/lib/auth'
import { TelaDaAuditoria } from '@/app/_shared/auditoria'
import type { FiltrosDaAuditoria } from '@/lib/auditoria/tipos'

/**
 * A Auditoria no portal da rede (CF3a). A trava é da página: o layout protege a
 * navegação, não a URL. Só a Admin da rede (2026-11-16: "Auditoria é só admin").
 */
export default async function AuditoriaDaRedePage({ searchParams }: { searchParams: Promise<FiltrosDaAuditoria> }) {
  const ctx = await getTenantContext()
  assertAuditoria(ctx)
  return <TelaDaAuditoria ctx={ctx} basePath="/admin/auditoria" slug={null} filtros={await searchParams} />
}
