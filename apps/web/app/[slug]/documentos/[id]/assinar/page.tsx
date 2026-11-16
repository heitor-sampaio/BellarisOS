import { getTenantContext } from '@/lib/auth'
import { assertColheOsDocumentos } from '@/lib/documentos/acesso'
import { idOu404 } from '@/lib/id-da-rota'
import { AssinaturaDeDocumento } from '@/app/_shared/assinatura-de-documento'

export default async function AssinarDocumentoNaUnidade({
  params, searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ voltar?: string }>
}) {
  // A página confere por si (§6): o layout protege a navegação, não a URL.
  // Abre a quem colhe — sem o módulo Documentos, que é o dos modelos (o
  // Heitor, 2026-11-16); o documento ainda passa pelo alcance e pelo escopo.
  assertColheOsDocumentos(await getTenantContext())
  const [{ slug, id }, { voltar }] = await Promise.all([params, searchParams])
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  return <AssinaturaDeDocumento id={id} base={`/${slug}`} voltar={voltar} />
}
