import { getTenantContext } from '@/lib/auth'
import { assertVeOsDocumentos } from '@/lib/documentos/acesso'
import { DocumentosEmitidos, type ParamsDosDocumentos } from '@/app/_shared/documentos-emitidos'

/** Os termos e contratos de toda a rede (`?unidade=` recorta uma). */
export default async function AdminDocumentosPage({ searchParams }: { searchParams: Promise<ParamsDosDocumentos> }) {
  // A página confere por si (§6): o layout protege a navegação, não a URL.
  // Vê os documentos quem vê a cliente (o Heitor, 2026-11-16).
  assertVeOsDocumentos(await getTenantContext())
  return <DocumentosEmitidos unidade={null} params={await searchParams} />
}
