import { getTenantContext, assertPermission } from '@/lib/auth'
import { AssinaturaDeDocumento } from '@/app/_shared/assinatura-de-documento'

export default async function AssinarDocumentoNaUnidade({
  params, searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ voltar?: string }>
}) {
  // A página confere por si (§6): o layout protege a navegação, não a URL.
  assertPermission(await getTenantContext(), 'documents', 'VIEW')
  const [{ slug, id }, { voltar }] = await Promise.all([params, searchParams])
  return <AssinaturaDeDocumento id={id} base={`/${slug}`} voltar={voltar} />
}
