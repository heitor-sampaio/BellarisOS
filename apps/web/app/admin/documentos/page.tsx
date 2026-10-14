import { getTenantContext, assertPermission } from '@/lib/auth'
import { DocumentosEmitidos, type ParamsDosDocumentos } from '@/app/_shared/documentos-emitidos'

/** Os termos e contratos de toda a rede (`?unidade=` recorta uma). */
export default async function AdminDocumentosPage({ searchParams }: { searchParams: Promise<ParamsDosDocumentos> }) {
  // A página confere por si (§6): o layout protege a navegação, não a URL.
  assertPermission(await getTenantContext(), 'documents', 'VIEW')
  return <DocumentosEmitidos unidade={null} params={await searchParams} />
}
