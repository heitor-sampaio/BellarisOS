import { getTenantContext, assertPermission } from '@/lib/auth'
import { AssinaturaDeDocumento } from '@/app/_shared/assinatura-de-documento'

export default async function AssinarDocumentoNaRede({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ voltar?: string }>
}) {
  // A página confere por si (§6): o layout protege a navegação, não a URL.
  assertPermission(await getTenantContext(), 'documents', 'VIEW')
  const [{ id }, { voltar }] = await Promise.all([params, searchParams])
  return <AssinaturaDeDocumento id={id} base="/admin" voltar={voltar} />
}
